"use strict";

const crypto = require("node:crypto");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getDatabase, ServerValue} = require("firebase-admin/database");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {
  CUSTOMER_VISIBLE_STATUSES,
  TERMINAL_STATUSES,
  assertPositiveInteger,
  calculateEstimate,
  canTransition,
  cleanOptionalText,
  cleanText,
  normalizePhone,
  safeBaseUrl
} = require("./domain");

initializeApp();
setGlobalOptions({region: "us-central1", maxInstances: 20, timeoutSeconds: 30, memory: "256MiB"});

const db = getDatabase();
const authAdmin = getAuth();
const CALLABLE_OPTIONS = {enforceAppCheck: true};
const STAFF_ROLES = new Set(["OWNER", "MANAGER", "MECHANIC", "ATTENDANT", "FINANCIAL"]);

function now() {
  return Date.now();
}

function callableError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof TypeError || error instanceof RangeError) {
    return new HttpsError("invalid-argument", error.message);
  }
  console.error(error);
  return new HttpsError("internal", "Não foi possível concluir a operação.");
}

function requireUser(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta para continuar.");
  return request.auth.uid;
}

async function requireMember(workshopId, uid, allowedRoles = STAFF_ROLES) {
  const membership = (await db.ref(`workshopUsers/${workshopId}/${uid}`).get()).val();
  if (!membership?.active || !allowedRoles.has(membership.role)) {
    throw new HttpsError("permission-denied", "Você não possui permissão para esta ação.");
  }
  return membership;
}

function idempotencyPath(uid, operation, requestId) {
  const safeId = cleanText(String(requestId || ""), {min: 16, max: 100, label: "Identificador da solicitação"});
  if (!/^[A-Za-z0-9_-]+$/.test(safeId)) throw new HttpsError("invalid-argument", "Identificador da solicitação inválido.");
  return `idempotency/${uid}/${operation}/${safeId}`;
}

async function existingIdempotentResult(path) {
  const result = (await db.ref(path).get()).val();
  return result?.result || null;
}

async function claimIdempotency(path) {
  const owner = crypto.randomUUID();
  const timestamp = now();
  const claim = await db.ref(path).transaction((current) => {
    if (current?.result) return current;
    if (!current || Number(current.expiresAt || 0) <= timestamp) {
      return {status: "PROCESSING", owner, createdAt: timestamp, expiresAt: timestamp + 120000};
    }
    return;
  }, undefined, false);
  const value = claim.snapshot.val();
  if (value?.result) return {result: value.result};
  if (!claim.committed || value?.owner !== owner) {
    throw new HttpsError("aborted", "Esta solicitação já está sendo processada.");
  }
  return {owner};
}

async function storeIdempotentResult(path, result) {
  await db.ref(path).set({result, createdAt: now()});
}

async function withLease(path, task) {
  const owner = crypto.randomUUID();
  const lockRef = db.ref(path);
  const timestamp = now();
  const result = await lockRef.transaction((current) => {
    if (!current || Number(current.expiresAt || 0) <= timestamp) {
      return {owner, acquiredAt: timestamp, expiresAt: timestamp + 30000};
    }
    return;
  }, undefined, false);
  if (!result.committed || result.snapshot.val()?.owner !== owner) {
    throw new HttpsError("aborted", "Outra atualização desta ordem está em andamento. Tente novamente em alguns segundos.");
  }
  try {
    return await task();
  } finally {
    const current = (await lockRef.get()).val();
    if (current?.owner === owner) await lockRef.remove();
  }
}

function makeAudit(workshopId, actorUid, action, entity, entityId, metadata = {}) {
  const auditId = db.ref(`auditLogs/${workshopId}`).push().key;
  return {
    path: `auditLogs/${workshopId}/${auditId}`,
    value: {actorUid, workshopId, action, entity, entityId, timestamp: now(), metadata}
  };
}

function statusLabel(status) {
  return ({
    RECEIVED: "Veículo recebido",
    DIAGNOSING: "Em diagnóstico",
    DIAGNOSED: "Diagnóstico concluído",
    AWAITING_APPROVAL: "Aguardando aprovação",
    WAITING_PARTS: "Aguardando peça",
    IN_PROGRESS: "Serviço em execução",
    FINAL_TESTS: "Testes finais",
    READY: "Veículo pronto",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado"
  })[status] || status;
}

async function materializePublicOrder(workshopId, orderId) {
  const [workshopSnap, orderSnap, eventsSnap, diagnosisSnap, estimatesSnap, paymentsSnap] = await Promise.all([
    db.ref(`workshops/${workshopId}`).get(),
    db.ref(`workOrders/${workshopId}/${orderId}`).get(),
    db.ref(`workOrderEvents/${workshopId}/${orderId}`).orderByChild("createdAt").limitToLast(100).get(),
    db.ref(`diagnoses/${workshopId}/${orderId}`).get(),
    db.ref(`estimates/${workshopId}/${orderId}`).get(),
    db.ref(`payments/${workshopId}/${orderId}`).get()
  ]);
  const order = orderSnap.val();
  if (!order) {
    await db.ref(`publicOrderViews/${workshopId}/${orderId}`).remove();
    return;
  }
  const [customerSnap, vehicleSnap] = await Promise.all([
    db.ref(`customers/${workshopId}/${order.customerId}`).get(),
    db.ref(`vehicles/${workshopId}/${order.vehicleId}`).get()
  ]);
  const workshop = workshopSnap.val() || {};
  const customer = customerSnap.val() || {};
  const vehicle = vehicleSnap.val() || {};
  const events = eventsSnap.val() || {};
  const diagnosis = diagnosisSnap.val() || null;
  const estimates = estimatesSnap.val() || {};
  const currentEstimate = order.currentEstimateVersion ? estimates[String(order.currentEstimateVersion)] || null : null;
  const payments = Object.values(paymentsSnap.val() || {}).filter((payment) => payment.status === "PAID");
  const publicEvents = Object.fromEntries(Object.entries(events)
    .filter(([, event]) => event.visibility === "CUSTOMER")
    .map(([id, event]) => [id, {
      id,
      type: event.type,
      previousStatus: event.previousStatus || null,
      newStatus: event.newStatus || null,
      description: event.description,
      createdAt: event.createdAt
    }]));
  const publicMedia = Object.fromEntries(Object.entries(diagnosis?.media || {}).map(([id, media]) => [id, {
    id,
    type: media.type,
    storagePath: media.storagePath,
    contentType: media.contentType,
    caption: media.caption || "",
    createdAt: media.createdAt
  }]));
  const publicEstimate = currentEstimate?.status !== "DRAFT" ? {
    id: currentEstimate.id,
    version: currentEstimate.version,
    status: currentEstimate.status,
    items: Object.fromEntries(Object.entries(currentEstimate.items || {}).map(([id, item]) => [id, {
      id,
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents
    }])),
    subtotalCents: currentEstimate.subtotalCents,
    discountCents: currentEstimate.discountCents,
    totalCents: currentEstimate.totalCents,
    approvedTotalCents: currentEstimate.approvedTotalCents || 0,
    approval: Object.fromEntries(Object.entries(currentEstimate.approval || {}).map(([id, decision]) => [id, {
      decision: decision.decision,
      decidedAt: decision.decidedAt
    }])),
    sentAt: currentEstimate.sentAt,
    decidedAt: currentEstimate.decidedAt || null
  } : null;
  const paidCents = payments.reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);
  const view = {
    workshop: {
      name: workshop.name || "Oficina",
      phone: workshop.phone || "",
      whatsapp: workshop.whatsapp || "",
      email: workshop.email || ""
    },
    customer: {name: customer.name || "Cliente"},
    vehicle: {
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year || null,
      plate: vehicle.plate || "",
      mileage: order.initialMileage || vehicle.mileage || 0
    },
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      orderNumberDisplay: order.orderNumberDisplay,
      status: order.status,
      customerComplaint: order.customerComplaint,
      estimatedCompletion: order.estimatedCompletion || null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paymentStatus: order.paymentStatus || "PENDING",
      paidCents
    },
    timeline: publicEvents,
    diagnosis: diagnosis ? {
      title: diagnosis.title,
      description: diagnosis.customerDescription,
      severity: diagnosis.severity,
      recommendation: diagnosis.recommendation,
      media: publicMedia
    } : null,
    estimate: publicEstimate,
    updatedAt: now()
  };
  await db.ref(`publicOrderViews/${workshopId}/${orderId}`).set(view);
}

exports.completeOnboarding = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    return await withLease(`locks/onboarding/${uid}`, async () => {
      const userRef = db.ref(`users/${uid}`);
      const existingUser = (await userRef.get()).val();
      if (existingUser?.currentWorkshopId) {
        const membership = (await db.ref(`workshopUsers/${existingUser.currentWorkshopId}/${uid}`).get()).val();
        if (membership?.active) {
          await authAdmin.setCustomUserClaims(uid, {workshopId: existingUser.currentWorkshopId, role: membership.role});
          return {workshopId: existingUser.currentWorkshopId, reused: true};
        }
      }
      const name = cleanText(request.data?.name, {min: 2, max: 120, label: "Nome"});
      const workshopName = cleanText(request.data?.workshopName, {min: 2, max: 120, label: "Nome da oficina"});
      const phone = normalizePhone(request.data?.phone);
      const document = cleanOptionalText(request.data?.document, {max: 18, label: "Documento"});
      const workshopId = db.ref("workshops").push().key;
      const timestamp = now();
      const email = String(request.auth.token.email || "").slice(0, 254);
      const audit = makeAudit(workshopId, uid, "WORKSHOP_CREATED", "workshop", workshopId);
      const updates = {
        [`users/${uid}`]: {uid, name, email, currentWorkshopId: workshopId, createdAt: timestamp, updatedAt: timestamp},
        [`workshops/${workshopId}`]: {
          id: workshopId,
          name: workshopName,
          ownerUid: uid,
          phone,
          whatsapp: phone,
          email,
          document,
          plan: "BASIC",
          status: "TRIAL",
          createdAt: timestamp,
          updatedAt: timestamp
        },
        [`workshopUsers/${workshopId}/${uid}`]: {uid, role: "OWNER", active: true, createdAt: timestamp, updatedAt: timestamp},
        [`workshopSettings/${workshopId}`]: {locale: "pt-BR", currency: "BRL", orderPrefix: "OS", createdAt: timestamp, updatedAt: timestamp},
        [audit.path]: audit.value
      };
      await db.ref().update(updates);
      await authAdmin.setCustomUserClaims(uid, {workshopId, role: "OWNER"});
      return {workshopId, reused: false};
    });
  } catch (error) {
    throw callableError(error);
  }
});

exports.createWorkOrder = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "ATTENDANT"]));
    const requestPath = idempotencyPath(uid, "createWorkOrder", request.data?.requestId);
    const previous = await existingIdempotentResult(requestPath);
    if (previous) return previous;
    const claim = await claimIdempotency(requestPath);
    if (claim.result) return claim.result;
    const customerId = cleanText(request.data?.customerId, {min: 10, max: 80, label: "Cliente"});
    const vehicleId = cleanText(request.data?.vehicleId, {min: 10, max: 80, label: "Veículo"});
    const assignedTo = cleanOptionalText(request.data?.assignedTo, {max: 128, label: "Responsável"});
    const customerComplaint = cleanText(request.data?.customerComplaint, {min: 3, max: 2000, label: "Relato do cliente"});
    const initialMileage = assertPositiveInteger(Number(request.data?.initialMileage), "Quilometragem", {max: 5000000});
    const [customerSnap, vehicleSnap] = await Promise.all([
      db.ref(`customers/${workshopId}/${customerId}`).get(),
      db.ref(`vehicles/${workshopId}/${vehicleId}`).get()
    ]);
    const customer = customerSnap.val();
    const vehicle = vehicleSnap.val();
    if (!customer?.active || !vehicle?.active || vehicle.ownerId !== customerId) {
      throw new HttpsError("failed-precondition", "Cliente ou veículo não pertence a esta oficina.");
    }
    const estimatedCompletion = request.data?.estimatedCompletion == null ? null : Number(request.data.estimatedCompletion);
    if (estimatedCompletion != null && (!Number.isSafeInteger(estimatedCompletion) || estimatedCompletion < now() - 86400000)) {
      throw new HttpsError("invalid-argument", "Previsão de conclusão inválida.");
    }
    const counterResult = await db.ref(`counters/${workshopId}/workOrders`).transaction((current) => Number(current || 0) + 1);
    const orderNumber = counterResult.snapshot.val();
    const orderId = db.ref(`workOrders/${workshopId}`).push().key;
    const eventId = db.ref(`workOrderEvents/${workshopId}/${orderId}`).push().key;
    const timestamp = now();
    const orderNumberDisplay = `OS-${String(orderNumber).padStart(6, "0")}`;
    const audit = makeAudit(workshopId, uid, "ORDER_CREATED", "workOrder", orderId, {orderNumberDisplay});
    const order = {
      id: orderId,
      workshopId,
      orderNumber,
      orderNumberDisplay,
      customerId,
      customerName: customer.name,
      vehicleId,
      vehicleLabel: `${vehicle.brand} ${vehicle.model}`.trim(),
      vehiclePlate: vehicle.plate,
      assignedTo,
      status: "RECEIVED",
      customerComplaint,
      initialMileage,
      estimatedCompletion,
      paymentStatus: "PENDING",
      paidAmountCents: 0,
      createdBy: uid,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await db.ref().update({
      [`workOrders/${workshopId}/${orderId}`]: order,
      [`workOrderEvents/${workshopId}/${orderId}/${eventId}`]: {
        id: eventId,
        orderId,
        type: "STATUS_CHANGE",
        previousStatus: null,
        newStatus: "RECEIVED",
        description: "Veículo recebido",
        userId: uid,
        createdAt: timestamp,
        visibility: "CUSTOMER"
      },
      [`customerOrders/${workshopId}/${customerId}/${orderId}`]: {orderId, createdAt: timestamp, status: "RECEIVED"},
      [`vehicleOrders/${workshopId}/${vehicleId}/${orderId}`]: {orderId, createdAt: timestamp, status: "RECEIVED"},
      [`analytics/${workshopId}/summary/openOrders`]: ServerValue.increment(1),
      [`analytics/${workshopId}/summary/totalOrders`]: ServerValue.increment(1),
      [`analytics/${workshopId}/monthly/${new Date(timestamp).toISOString().slice(0, 7)}/ordersCreated`]: ServerValue.increment(1),
      [audit.path]: audit.value
    });
    const result = {workshopId, orderId, orderNumber, orderNumberDisplay};
    await storeIdempotentResult(requestPath, result);
    await materializePublicOrder(workshopId, orderId);
    return result;
  } catch (error) {
    throw callableError(error);
  }
});

exports.changeOrderStatus = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    const nextStatus = cleanText(request.data?.nextStatus, {min: 3, max: 40, label: "Status"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "MECHANIC", "ATTENDANT"]));
    const requestPath = idempotencyPath(uid, "changeOrderStatus", request.data?.requestId);
    const previous = await existingIdempotentResult(requestPath);
    if (previous) return previous;
    const claim = await claimIdempotency(requestPath);
    if (claim.result) return claim.result;
    return await withLease(`locks/orders/${workshopId}/${orderId}`, async () => {
    const orderRef = db.ref(`workOrders/${workshopId}/${orderId}`);
    const order = (await orderRef.get()).val();
    if (!order) throw new HttpsError("not-found", "Ordem de serviço não encontrada.");
    if (request.data?.expectedStatus && request.data.expectedStatus !== order.status) {
      throw new HttpsError("aborted", "A ordem foi atualizada por outra pessoa. Recarregue antes de tentar novamente.");
    }
    if (!canTransition(order.status, nextStatus)) {
      throw new HttpsError("failed-precondition", `Não é possível avançar de ${statusLabel(order.status)} para ${statusLabel(nextStatus)}.`);
    }
    const timestamp = now();
    const eventId = db.ref(`workOrderEvents/${workshopId}/${orderId}`).push().key;
    const audit = makeAudit(workshopId, uid, "ORDER_STATUS_CHANGED", "workOrder", orderId, {from: order.status, to: nextStatus});
    const updates = {
      [`workOrders/${workshopId}/${orderId}/status`]: nextStatus,
      [`workOrders/${workshopId}/${orderId}/updatedAt`]: timestamp,
      [`customerOrders/${workshopId}/${order.customerId}/${orderId}/status`]: nextStatus,
      [`vehicleOrders/${workshopId}/${order.vehicleId}/${orderId}/status`]: nextStatus,
      [`workOrderEvents/${workshopId}/${orderId}/${eventId}`]: {
        id: eventId,
        orderId,
        type: "STATUS_CHANGE",
        previousStatus: order.status,
        newStatus: nextStatus,
        description: statusLabel(nextStatus),
        userId: uid,
        createdAt: timestamp,
        visibility: CUSTOMER_VISIBLE_STATUSES.has(nextStatus) ? "CUSTOMER" : "INTERNAL"
      },
      [audit.path]: audit.value
    };
    if (!TERMINAL_STATUSES.has(order.status) && TERMINAL_STATUSES.has(nextStatus)) {
      updates[`analytics/${workshopId}/summary/openOrders`] = ServerValue.increment(-1);
      updates[`analytics/${workshopId}/summary/completedOrders`] = ServerValue.increment(nextStatus === "DELIVERED" ? 1 : 0);
      updates[`analytics/${workshopId}/monthly/${new Date(timestamp).toISOString().slice(0, 7)}/ordersCompleted`] = ServerValue.increment(nextStatus === "DELIVERED" ? 1 : 0);
      updates[`workOrders/${workshopId}/${orderId}/completedAt`] = timestamp;
    }
    await db.ref().update(updates);
    await materializePublicOrder(workshopId, orderId);
    const result = {status: nextStatus, updatedAt: timestamp};
    await storeIdempotentResult(requestPath, result);
    return result;
    });
  } catch (error) {
    throw callableError(error);
  }
});

exports.upsertDiagnosis = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "MECHANIC"]));
    const order = (await db.ref(`workOrders/${workshopId}/${orderId}`).get()).val();
    if (!order) throw new HttpsError("not-found", "Ordem de serviço não encontrada.");
    const title = cleanText(request.data?.title, {min: 3, max: 140, label: "Título"});
    const customerDescription = cleanText(request.data?.customerDescription, {min: 5, max: 3000, label: "Descrição para o cliente"});
    const internalNotes = cleanOptionalText(request.data?.internalNotes, {max: 5000, label: "Observações internas"});
    const recommendation = cleanOptionalText(request.data?.recommendation, {max: 2000, label: "Recomendação"});
    const severity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(request.data?.severity) ? request.data.severity : "MEDIUM";
    const previous = (await db.ref(`diagnoses/${workshopId}/${orderId}`).get()).val() || {};
    const timestamp = now();
    const eventId = db.ref(`workOrderEvents/${workshopId}/${orderId}`).push().key;
    const audit = makeAudit(workshopId, uid, "DIAGNOSIS_UPDATED", "diagnosis", orderId);
    await db.ref().update({
      [`diagnoses/${workshopId}/${orderId}`]: {
        id: orderId,
        orderId,
        workshopId,
        title,
        customerDescription,
        internalNotes,
        recommendation,
        severity,
        media: previous.media || {},
        createdBy: previous.createdBy || uid,
        createdAt: previous.createdAt || timestamp,
        updatedBy: uid,
        updatedAt: timestamp
      },
      [`workOrderEvents/${workshopId}/${orderId}/${eventId}`]: {
        id: eventId,
        orderId,
        type: "DIAGNOSIS",
        description: title,
        userId: uid,
        createdAt: timestamp,
        visibility: "CUSTOMER"
      },
      [`workOrders/${workshopId}/${orderId}/updatedAt`]: timestamp,
      [audit.path]: audit.value
    });
    await materializePublicOrder(workshopId, orderId);
    return {updatedAt: timestamp};
  } catch (error) {
    throw callableError(error);
  }
});

exports.addOrderMedia = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "MECHANIC"]));
    const type = request.data?.type === "VIDEO" ? "VIDEO" : "IMAGE";
    const storagePath = cleanText(request.data?.storagePath, {min: 20, max: 500, label: "Arquivo"});
    const requiredPrefix = `workshops/${workshopId}/orders/${orderId}/${type === "IMAGE" ? "images" : "videos"}/`;
    if (!storagePath.startsWith(requiredPrefix)) throw new HttpsError("permission-denied", "Caminho de arquivo inválido.");
    const mediaId = db.ref(`diagnoses/${workshopId}/${orderId}/media`).push().key;
    const timestamp = now();
    const media = {
      id: mediaId,
      type,
      storagePath,
      contentType: cleanText(request.data?.contentType, {min: 5, max: 100, label: "Tipo de arquivo"}),
      size: assertPositiveInteger(Number(request.data?.size), "Tamanho do arquivo", {allowZero: false, max: type === "IMAGE" ? 8388608 : 52428800}),
      caption: cleanOptionalText(request.data?.caption, {max: 300, label: "Legenda"}),
      createdBy: uid,
      createdAt: timestamp
    };
    const audit = makeAudit(workshopId, uid, "ORDER_MEDIA_ADDED", "workOrder", orderId, {mediaId, type});
    await db.ref().update({
      [`diagnoses/${workshopId}/${orderId}/media/${mediaId}`]: media,
      [`workOrders/${workshopId}/${orderId}/updatedAt`]: timestamp,
      [audit.path]: audit.value
    });
    await materializePublicOrder(workshopId, orderId);
    return {mediaId};
  } catch (error) {
    throw callableError(error);
  }
});

exports.createEstimate = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "ATTENDANT", "FINANCIAL"]));
    const requestPath = idempotencyPath(uid, "createEstimate", request.data?.requestId);
    const previous = await existingIdempotentResult(requestPath);
    if (previous) return previous;
    const claim = await claimIdempotency(requestPath);
    if (claim.result) return claim.result;
    const order = (await db.ref(`workOrders/${workshopId}/${orderId}`).get()).val();
    if (!order) throw new HttpsError("not-found", "Ordem de serviço não encontrada.");
    const calculated = calculateEstimate(request.data?.items, Number(request.data?.discountCents || 0));
    const counter = await db.ref(`counters/${workshopId}/estimateVersions/${orderId}`).transaction((current) => Number(current || 0) + 1);
    const version = counter.snapshot.val();
    const timestamp = now();
    const items = Object.fromEntries(calculated.items.map((item) => [item.id, {...item, status: "PENDING"}]));
    const estimate = {
      id: `${orderId}-v${version}`,
      orderId,
      workshopId,
      version,
      status: "SENT",
      items,
      subtotalCents: calculated.subtotalCents,
      discountCents: calculated.discountCents,
      totalCents: calculated.totalCents,
      createdBy: uid,
      createdAt: timestamp,
      sentAt: timestamp
    };
    const eventId = db.ref(`workOrderEvents/${workshopId}/${orderId}`).push().key;
    const audit = makeAudit(workshopId, uid, "ESTIMATE_SENT", "estimate", estimate.id, {version, totalCents: estimate.totalCents});
    await db.ref().update({
      [`estimates/${workshopId}/${orderId}/${version}`]: estimate,
      [`workOrders/${workshopId}/${orderId}/currentEstimateVersion`]: version,
      [`workOrders/${workshopId}/${orderId}/estimatedTotalCents`]: estimate.totalCents,
      [`workOrders/${workshopId}/${orderId}/updatedAt`]: timestamp,
      [`workOrderEvents/${workshopId}/${orderId}/${eventId}`]: {
        id: eventId,
        orderId,
        type: "ESTIMATE",
        description: "Orçamento enviado para aprovação",
        userId: uid,
        createdAt: timestamp,
        visibility: "CUSTOMER"
      },
      [`analytics/${workshopId}/monthly/${new Date(timestamp).toISOString().slice(0, 7)}/estimatesSent`]: ServerValue.increment(1),
      [audit.path]: audit.value
    });
    await materializePublicOrder(workshopId, orderId);
    const result = {version, totalCents: estimate.totalCents};
    await storeIdempotentResult(requestPath, result);
    return result;
  } catch (error) {
    throw callableError(error);
  }
});

exports.createShareLink = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "ATTENDANT"]));
    if (!(await db.ref(`workOrders/${workshopId}/${orderId}`).get()).exists()) throw new HttpsError("not-found", "Ordem não encontrada.");
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const shareId = db.ref(`shareLinks/${workshopId}/${orderId}`).push().key;
    const timestamp = now();
    const expiresInDays = Math.min(Math.max(Number(request.data?.expiresInDays || 30), 1), 90);
    const expiresAt = timestamp + expiresInDays * 86400000;
    const baseUrl = safeBaseUrl(request.data?.baseUrl);
    const audit = makeAudit(workshopId, uid, "SHARE_LINK_CREATED", "shareLink", shareId, {orderId, expiresAt});
    await db.ref().update({
      [`shareLinks/${workshopId}/${orderId}/${shareId}`]: {id: shareId, orderId, workshopId, tokenHash, active: true, expiresAt, createdBy: uid, createdAt: timestamp},
      [`shareLinksByHash/${tokenHash}`]: {shareId, orderId, workshopId, expiresAt, active: true},
      [audit.path]: audit.value
    });
    return {shareId, expiresAt, url: `${baseUrl}/acompanhar?token=${encodeURIComponent(token)}`};
  } catch (error) {
    throw callableError(error);
  }
});

exports.revokeShareLink = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    const shareId = cleanText(request.data?.shareId, {min: 10, max: 80, label: "Link"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "ATTENDANT"]));
    const linkRef = db.ref(`shareLinks/${workshopId}/${orderId}/${shareId}`);
    const link = (await linkRef.get()).val();
    if (!link) throw new HttpsError("not-found", "Link não encontrado.");
    const timestamp = now();
    const audit = makeAudit(workshopId, uid, "SHARE_LINK_REVOKED", "shareLink", shareId, {orderId});
    const updates = {
      [`shareLinks/${workshopId}/${orderId}/${shareId}/active`]: false,
      [`shareLinks/${workshopId}/${orderId}/${shareId}/revokedAt`]: timestamp,
      [audit.path]: audit.value
    };
    if (link.tokenHash) {
      updates[`shareLinksByHash/${link.tokenHash}/active`] = false;
    }
    await db.ref().update(updates);
    return {shareId, revokedAt: timestamp};
  } catch (error) {
    throw callableError(error);
  }
});

exports.exchangeShareToken = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const token = cleanText(request.data?.token, {min: 40, max: 100, label: "Token"});
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = (await db.ref(`shareLinksByHash/${tokenHash}`).get()).val();
    if (!record?.active || Number(record.expiresAt) <= now()) {
      throw new HttpsError("permission-denied", "Este link é inválido, expirou ou foi revogado.");
    }
    const publicRecord = (await db.ref(`shareLinks/${record.workshopId}/${record.orderId}/${record.shareId}`).get()).val();
    if (!publicRecord?.active || Number(publicRecord.expiresAt) <= now()) {
      throw new HttpsError("permission-denied", "Este link é inválido, expirou ou foi revogado.");
    }
    const sessionUid = `public-${record.shareId}`;
    const customToken = await authAdmin.createCustomToken(sessionUid, {
      role: "CUSTOMER",
      workshopId: record.workshopId,
      orderId: record.orderId,
      shareId: record.shareId
    });
    return {customToken, workshopId: record.workshopId, orderId: record.orderId, expiresAt: record.expiresAt};
  } catch (error) {
    throw callableError(error);
  }
});

exports.decideEstimate = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const claims = request.auth.token || {};
    if (claims.role !== "CUSTOMER") throw new HttpsError("permission-denied", "Sessão de cliente inválida.");
    const {workshopId, orderId, shareId} = claims;
    return await withLease(`locks/orders/${workshopId}/${orderId}`, async () => {
    const link = (await db.ref(`shareLinks/${workshopId}/${orderId}/${shareId}`).get()).val();
    if (!link?.active || Number(link.expiresAt) <= now()) throw new HttpsError("permission-denied", "Este link expirou ou foi revogado.");
    const order = (await db.ref(`workOrders/${workshopId}/${orderId}`).get()).val();
    const version = Number(order?.currentEstimateVersion || 0);
    const estimateRef = db.ref(`estimates/${workshopId}/${orderId}/${version}`);
    const estimate = (await estimateRef.get()).val();
    if (!estimate || estimate.status !== "SENT") throw new HttpsError("failed-precondition", "Este orçamento não está mais aguardando decisão.");
    const decisions = request.data?.decisions;
    if (!decisions || typeof decisions !== "object") throw new HttpsError("invalid-argument", "Informe a decisão dos itens.");
    const itemIds = Object.keys(estimate.items || {});
    if (itemIds.length === 0 || itemIds.some((id) => !["APPROVED", "REJECTED"].includes(decisions[id]))) {
      throw new HttpsError("invalid-argument", "Decida todos os itens antes de confirmar.");
    }
    const timestamp = now();
    const approval = Object.fromEntries(itemIds.map((id) => [id, {decision: decisions[id], decidedAt: timestamp, actorUid: uid}]));
    const approvedCount = itemIds.filter((id) => decisions[id] === "APPROVED").length;
    const status = approvedCount === itemIds.length ? "APPROVED" : approvedCount === 0 ? "REJECTED" : "PARTIALLY_APPROVED";
    const approvedTotalCents = itemIds.reduce((sum, id) => sum + (decisions[id] === "APPROVED" ? Number(estimate.items[id].totalCents || 0) : 0), 0);
    const eventId = db.ref(`workOrderEvents/${workshopId}/${orderId}`).push().key;
    const audit = makeAudit(workshopId, uid, status === "REJECTED" ? "ESTIMATE_REJECTED" : "ESTIMATE_APPROVED", "estimate", estimate.id, {status, approvedTotalCents});
    const month = new Date(timestamp).toISOString().slice(0, 7);
    await db.ref().update({
      [`estimates/${workshopId}/${orderId}/${version}/status`]: status,
      [`estimates/${workshopId}/${orderId}/${version}/approval`]: approval,
      [`estimates/${workshopId}/${orderId}/${version}/approvedTotalCents`]: approvedTotalCents,
      [`estimates/${workshopId}/${orderId}/${version}/decidedAt`]: timestamp,
      [`workOrders/${workshopId}/${orderId}/estimateStatus`]: status,
      [`workOrders/${workshopId}/${orderId}/approvedTotalCents`]: approvedTotalCents,
      [`workOrders/${workshopId}/${orderId}/updatedAt`]: timestamp,
      [`workOrderEvents/${workshopId}/${orderId}/${eventId}`]: {
        id: eventId,
        orderId,
        type: "ESTIMATE_DECISION",
        description: status === "APPROVED" ? "Orçamento aprovado" : status === "REJECTED" ? "Orçamento recusado" : "Orçamento aprovado parcialmente",
        userId: uid,
        createdAt: timestamp,
        visibility: "CUSTOMER"
      },
      [`analytics/${workshopId}/monthly/${month}/${status === "REJECTED" ? "estimatesRejected" : "estimatesApproved"}`]: ServerValue.increment(1),
      [`analytics/${workshopId}/monthly/${month}/approvedRevenueCents`]: ServerValue.increment(approvedTotalCents),
      [audit.path]: audit.value
    });
    await materializePublicOrder(workshopId, orderId);
    return {status, approvedTotalCents, decidedAt: timestamp};
    });
  } catch (error) {
    throw callableError(error);
  }
});

exports.recordPayment = onCall(CALLABLE_OPTIONS, async (request) => {
  try {
    const uid = requireUser(request);
    const workshopId = cleanText(request.data?.workshopId, {min: 10, max: 80, label: "Oficina"});
    const orderId = cleanText(request.data?.orderId, {min: 10, max: 80, label: "Ordem"});
    await requireMember(workshopId, uid, new Set(["OWNER", "MANAGER", "FINANCIAL"]));
    const requestPath = idempotencyPath(uid, "recordPayment", request.data?.requestId);
    const previous = await existingIdempotentResult(requestPath);
    if (previous) return previous;
    const claim = await claimIdempotency(requestPath);
    if (claim.result) return claim.result;
    return await withLease(`locks/orders/${workshopId}/${orderId}`, async () => {
    const order = (await db.ref(`workOrders/${workshopId}/${orderId}`).get()).val();
    if (!order) throw new HttpsError("not-found", "Ordem de serviço não encontrada.");
    const amountCents = assertPositiveInteger(Number(request.data?.amountCents), "Valor", {allowZero: false, max: 1000000000});
    const method = ["PIX", "CASH", "CREDIT", "DEBIT", "TRANSFER", "OTHER"].includes(request.data?.method) ? request.data.method : "OTHER";
    const paymentId = db.ref(`payments/${workshopId}/${orderId}`).push().key;
    const timestamp = now();
    const paidAmountCents = Number(order.paidAmountCents || 0) + amountCents;
    const expectedTotal = Number(order.approvedTotalCents || order.estimatedTotalCents || 0);
    const paymentStatus = expectedTotal > 0 && paidAmountCents >= expectedTotal ? "PAID" : "PARTIAL";
    const audit = makeAudit(workshopId, uid, "PAYMENT_REGISTERED", "payment", paymentId, {orderId, amountCents, method});
    await db.ref().update({
      [`payments/${workshopId}/${orderId}/${paymentId}`]: {id: paymentId, orderId, workshopId, amountCents, method, status: "PAID", note: cleanOptionalText(request.data?.note, {max: 500, label: "Observação"}), paidAt: timestamp, createdBy: uid, createdAt: timestamp},
      [`workOrders/${workshopId}/${orderId}/paidAmountCents`]: paidAmountCents,
      [`workOrders/${workshopId}/${orderId}/paymentStatus`]: paymentStatus,
      [`workOrders/${workshopId}/${orderId}/updatedAt`]: timestamp,
      [`analytics/${workshopId}/monthly/${new Date(timestamp).toISOString().slice(0, 7)}/revenueCents`]: ServerValue.increment(amountCents),
      [audit.path]: audit.value
    });
    await materializePublicOrder(workshopId, orderId);
    const result = {paymentId, paidAmountCents, paymentStatus};
    await storeIdempotentResult(requestPath, result);
    return result;
    });
  } catch (error) {
    throw callableError(error);
  }
});
