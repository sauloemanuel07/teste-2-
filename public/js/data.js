import {
  endAt,
  get,
  limitToFirst,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref as databaseRef,
  serverTimestamp,
  set,
  startAt,
  update
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import {httpsCallable} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-functions.js";
import {
  getBlob,
  ref as storageRef,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import {firebaseReady} from "./firebase.js";
import {normalizeForSearch, normalizePhone, normalizePlate} from "./format.js";
import {optionalText, requiredText, validEmail, validMileage, validPhone, validPlate, validYear} from "./validators.js";

function requestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function values(snapshot) {
  const data = snapshot.val() || {};
  return Object.values(data).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function listCustomers(workshopId, limit = 50) {
  const {database} = await firebaseReady;
  const snapshot = await get(query(databaseRef(database, `customers/${workshopId}`), orderByChild("createdAt"), limitToLast(limit)));
  return values(snapshot).filter((item) => item.active !== false);
}

export async function searchCustomers(workshopId, term) {
  const {database} = await firebaseReady;
  const phone = normalizePhone(term);
  const child = phone.length >= 3 ? "phoneNormalized" : "nameNormalized";
  const normalized = phone.length >= 3 ? phone : normalizeForSearch(term);
  if (!normalized) return listCustomers(workshopId, 50);
  const snapshot = await get(query(databaseRef(database, `customers/${workshopId}`), orderByChild(child), startAt(normalized), endAt(`${normalized}\uf8ff`), limitToFirst(25)));
  return values(snapshot).filter((item) => item.active !== false);
}

export async function saveCustomer(context, formData, customerId = null) {
  const {database} = await firebaseReady;
  const ref = customerId ? databaseRef(database, `customers/${context.workshopId}/${customerId}`) : push(databaseRef(database, `customers/${context.workshopId}`));
  const existing = customerId ? (await get(ref)).val() : null;
  const name = requiredText(formData.name, "Nome", {max: 120});
  const phoneNormalized = validPhone(formData.phone);
  const payload = {
    id: ref.key,
    workshopId: context.workshopId,
    name,
    nameNormalized: normalizeForSearch(name),
    phone: requiredText(formData.phone, "Telefone", {min: 10, max: 24}),
    phoneNormalized,
    email: validEmail(formData.email),
    document: optionalText(formData.document, "CPF/CNPJ", {max: 18}),
    notes: optionalText(formData.notes, "Observações", {max: 2000}),
    active: existing?.active ?? true,
    createdAt: existing?.createdAt || serverTimestamp(),
    createdBy: existing?.createdBy || context.user.uid,
    updatedAt: serverTimestamp()
  };
  await set(ref, payload);
  return ref.key;
}

export async function archiveCustomer(context, customerId) {
  const {database} = await firebaseReady;
  await update(databaseRef(database, `customers/${context.workshopId}/${customerId}`), {active: false, updatedAt: serverTimestamp()});
}

export async function listVehicles(workshopId, limit = 50) {
  const {database} = await firebaseReady;
  const snapshot = await get(query(databaseRef(database, `vehicles/${workshopId}`), orderByChild("createdAt"), limitToLast(limit)));
  return values(snapshot).filter((item) => item.active !== false);
}

export async function searchVehicles(workshopId, term) {
  const {database} = await firebaseReady;
  const plate = normalizePlate(term);
  if (plate.length >= 2) {
    const snapshot = await get(query(databaseRef(database, `vehicles/${workshopId}`), orderByChild("plateNormalized"), startAt(plate), endAt(`${plate}\uf8ff`), limitToFirst(25)));
    return values(snapshot).filter((item) => item.active !== false);
  }
  return listVehicles(workshopId, 50);
}

export async function saveVehicle(context, formData, vehicleId = null) {
  const {database} = await firebaseReady;
  const ref = vehicleId ? databaseRef(database, `vehicles/${context.workshopId}/${vehicleId}`) : push(databaseRef(database, `vehicles/${context.workshopId}`));
  const existing = vehicleId ? (await get(ref)).val() : null;
  const plate = validPlate(formData.plate);
  const payload = {
    id: ref.key,
    workshopId: context.workshopId,
    ownerId: requiredText(formData.ownerId, "Proprietário", {min: 10, max: 80}),
    plate,
    plateNormalized: plate,
    brand: requiredText(formData.brand, "Marca", {max: 80}),
    model: requiredText(formData.model, "Modelo", {max: 80}),
    version: optionalText(formData.version, "Versão", {max: 100}),
    year: validYear(formData.year),
    color: optionalText(formData.color, "Cor", {max: 50}),
    mileage: validMileage(formData.mileage),
    fuel: optionalText(formData.fuel, "Combustível", {max: 30}),
    notes: optionalText(formData.notes, "Observações", {max: 2000}),
    active: existing?.active ?? true,
    createdAt: existing?.createdAt || serverTimestamp(),
    createdBy: existing?.createdBy || context.user.uid,
    updatedAt: serverTimestamp()
  };
  await set(ref, payload);
  return ref.key;
}

export async function archiveVehicle(context, vehicleId) {
  const {database} = await firebaseReady;
  await update(databaseRef(database, `vehicles/${context.workshopId}/${vehicleId}`), {active: false, updatedAt: serverTimestamp()});
}

export async function listOrders(workshopId, limit = 50) {
  const {database} = await firebaseReady;
  const snapshot = await get(query(databaseRef(database, `workOrders/${workshopId}`), orderByChild("createdAt"), limitToLast(limit)));
  return values(snapshot);
}

export async function getDashboard(workshopId) {
  const {database} = await firebaseReady;
  const month = new Date().toISOString().slice(0, 7);
  const [summary, monthly, orders] = await Promise.all([
    get(databaseRef(database, `analytics/${workshopId}/summary`)),
    get(databaseRef(database, `analytics/${workshopId}/monthly/${month}`)),
    get(query(databaseRef(database, `workOrders/${workshopId}`), orderByChild("createdAt"), limitToLast(8)))
  ]);
  return {summary: summary.val() || {}, monthly: monthly.val() || {}, recentOrders: values(orders)};
}

export async function getOrderBundle(workshopId, orderId) {
  const {database} = await firebaseReady;
  const [order, events, diagnosis, estimates, payments, shareLinks] = await Promise.all([
    get(databaseRef(database, `workOrders/${workshopId}/${orderId}`)),
    get(databaseRef(database, `workOrderEvents/${workshopId}/${orderId}`)),
    get(databaseRef(database, `diagnoses/${workshopId}/${orderId}`)),
    get(databaseRef(database, `estimates/${workshopId}/${orderId}`)),
    get(databaseRef(database, `payments/${workshopId}/${orderId}`)),
    get(databaseRef(database, `shareLinks/${workshopId}/${orderId}`))
  ]);
  const orderData = order.val();
  if (!orderData) return null;
  const [customer, vehicle] = await Promise.all([
    get(databaseRef(database, `customers/${workshopId}/${orderData.customerId}`)),
    get(databaseRef(database, `vehicles/${workshopId}/${orderData.vehicleId}`))
  ]);
  return {
    order: orderData,
    customer: customer.val(),
    vehicle: vehicle.val(),
    events: values(events).reverse(),
    diagnosis: diagnosis.val(),
    estimates: estimates.val() || {},
    payments: values(payments),
    shareLinks: values(shareLinks)
  };
}

export async function callBackend(name, data = {}) {
  const {functions} = await firebaseReady;
  const result = await httpsCallable(functions, name)({...data, requestId: data.requestId || requestId()});
  return result.data;
}

export async function uploadOrderMedia(context, orderId, file, caption, onProgress = () => {}) {
  const {storage} = await firebaseReady;
  const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type);
  if (!isImage && !isVideo) throw new Error("Formato não permitido. Use JPEG, PNG, WebP, MP4, WebM ou MOV.");
  const max = isImage ? 8 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size <= 0 || file.size > max) throw new Error(`O arquivo deve ter no máximo ${isImage ? "8 MB" : "50 MB"}.`);
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (isImage ? "jpg" : "mp4");
  const typeFolder = isImage ? "images" : "videos";
  const path = `workshops/${context.workshopId}/orders/${orderId}/${typeFolder}/${crypto.randomUUID()}.${extension}`;
  const target = storageRef(storage, path);
  const task = uploadBytesResumable(target, file, {
    contentType: file.type,
    customMetadata: {ownerUid: context.user.uid, workshopId: context.workshopId, orderId}
  });
  await new Promise((resolve, reject) => task.on("state_changed", (snapshot) => onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve));
  await callBackend("addOrderMedia", {workshopId: context.workshopId, orderId, storagePath: path, type: isImage ? "IMAGE" : "VIDEO", contentType: file.type, size: file.size, caption});
  return path;
}

export async function mediaObjectUrl(path) {
  const {storage} = await firebaseReady;
  const blob = await getBlob(storageRef(storage, path), 55 * 1024 * 1024);
  return URL.createObjectURL(blob);
}

export async function subscribePublicOrder(workshopId, orderId, callback, onError) {
  const {database} = await firebaseReady;
  return onValue(databaseRef(database, `publicOrderViews/${workshopId}/${orderId}`), (snapshot) => callback(snapshot.val()), onError);
}
