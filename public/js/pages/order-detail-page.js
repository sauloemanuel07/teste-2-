import {callBackend, getOrderBundle, mediaObjectUrl, uploadOrderMedia} from "../data.js";
import {formatCurrency, formatDate, NEXT_STATUS, parseCurrencyToCents, statusLabel, statusTone} from "../format.js";
import {confirmAction, friendlyError, setButtonLoading, showToast} from "../ui.js";
import {optionalText, requiredText} from "../validators.js";

function validFirebaseId(value) {
  return /^[A-Za-z0-9_-]{10,80}$/.test(value || "");
}

function appendTextCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
}

function renderTimeline(container, events) {
  container.replaceChildren();
  if (!events.length) { const p = document.createElement("p"); p.className = "muted small"; p.textContent = "Nenhum evento registrado."; container.append(p); return; }
  events.forEach((event) => {
    const item = document.createElement("li"); item.className = "timeline-item";
    const wrapper = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = event.description || event.type; const meta = document.createElement("p"); meta.className = "small muted"; meta.textContent = event.visibility === "CUSTOMER" ? "Visível para o cliente" : "Somente equipe"; wrapper.append(strong, meta);
    const time = document.createElement("time"); time.dateTime = new Date(event.createdAt).toISOString(); time.textContent = formatDate(event.createdAt);
    item.append(wrapper, time); container.append(item);
  });
}

async function renderMedia(container, media) {
  container.replaceChildren();
  const items = Object.values(media || {});
  if (!items.length) { const p = document.createElement("p"); p.className = "small muted"; p.textContent = "Nenhuma foto ou vídeo adicionado."; container.append(p); return; }
  for (const item of items) {
    const figure = document.createElement("figure"); figure.className = "media-card";
    try {
      const url = await mediaObjectUrl(item.storagePath);
      const element = item.type === "VIDEO" ? document.createElement("video") : document.createElement("img");
      element.src = url;
      if (item.type === "VIDEO") element.controls = true; else element.alt = item.caption || "Registro visual do diagnóstico";
      element.addEventListener("load", () => URL.revokeObjectURL(url), {once: true});
      figure.append(element);
    } catch {
      const error = document.createElement("p"); error.className = "small muted"; error.textContent = "Mídia indisponível."; figure.append(error);
    }
    container.append(figure);
  }
}

function renderEstimate(container, estimate) {
  container.replaceChildren();
  if (!estimate) { const p = document.createElement("p"); p.className = "small muted"; p.textContent = "Nenhum orçamento enviado."; container.append(p); return; }
  const table = document.createElement("table"); table.className = "data-table";
  table.innerHTML = "<thead><tr><th>Item</th><th>Qtd.</th><th>Unitário</th><th>Total</th><th>Decisão</th></tr></thead>";
  const body = document.createElement("tbody");
  Object.values(estimate.items || {}).forEach((item) => {
    const row = document.createElement("tr");
    appendTextCell(row, item.description); appendTextCell(row, String(item.quantity)); appendTextCell(row, formatCurrency(item.unitPriceCents)); appendTextCell(row, formatCurrency(item.totalCents)); appendTextCell(row, estimate.approval?.[item.id]?.decision === "APPROVED" ? "Aprovado" : estimate.approval?.[item.id]?.decision === "REJECTED" ? "Recusado" : "Pendente");
    body.append(row);
  });
  const foot = document.createElement("tfoot");
  const row = document.createElement("tr"); const label = document.createElement("th"); label.colSpan = 3; label.textContent = `Versão ${estimate.version} · ${estimate.status}`; const total = document.createElement("th"); total.colSpan = 2; total.textContent = formatCurrency(estimate.totalCents); row.append(label, total); foot.append(row);
  table.append(body, foot); container.append(table);
}

function addEstimateItem(container) {
  const index = container.children.length + 1;
  const row = document.createElement("div"); row.className = "form-grid card-body"; row.dataset.estimateItem = "true";
  row.innerHTML = `<div class="field form-span-2"><label>Descrição do item ${index}</label><input name="description" required maxlength="180"></div><div class="field"><label>Tipo</label><select name="type"><option value="SERVICE">Serviço</option><option value="PART">Peça</option><option value="LABOR">Mão de obra</option></select></div><div class="field"><label>Quantidade</label><input name="quantity" type="number" min="1" max="10000" value="1" required></div><div class="field"><label>Valor unitário (R$)</label><input name="unitPrice" inputmode="decimal" placeholder="0,00" required></div><div class="field"><label>&nbsp;</label><button class="btn btn-danger" type="button" data-remove-item>Remover</button></div>`;
  row.querySelector("[data-remove-item]").addEventListener("click", () => { if (container.children.length > 1) row.remove(); });
  container.append(row);
}

function collectEstimateItems(container) {
  return [...container.querySelectorAll("[data-estimate-item]")].map((row) => {
    const description = requiredText(row.querySelector("[name='description']").value, "Descrição", {max: 180});
    const quantity = Number(row.querySelector("[name='quantity']").value);
    const unitPriceCents = parseCurrencyToCents(row.querySelector("[name='unitPrice']").value);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Informe uma quantidade válida.");
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new Error("Informe um valor unitário válido.");
    return {id: crypto.randomUUID().replace(/-/g, ""), type: row.querySelector("[name='type']").value, description, quantity, unitPriceCents};
  });
}

function detailTemplate() {
  return `<header class="page-header"><div><span class="eyebrow" id="order-number"></span><h1 id="order-title">Ordem de serviço</h1><p id="order-subtitle"></p></div><span class="badge" id="order-status"></span></header><section class="detail-grid"><div class="detail-main"><article class="card"><div class="card-header"><div><h2 class="card-title">Timeline</h2><p class="small muted">Toda mudança relevante fica registrada.</p></div></div><div class="card-body"><ol class="timeline" id="order-timeline"></ol></div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Diagnóstico</h2><p class="small muted">A descrição do cliente nunca inclui observações internas.</p></div></div><form id="diagnosis-form" class="card-body form-grid" novalidate><div class="field"><label for="diagnosis-title">Título</label><input id="diagnosis-title" name="title" required maxlength="140"></div><div class="field"><label for="diagnosis-severity">Gravidade</label><select id="diagnosis-severity" name="severity"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></div><div class="field form-span-2"><label for="diagnosis-customer">Explicação para o cliente</label><textarea id="diagnosis-customer" name="customerDescription" required maxlength="3000"></textarea></div><div class="field form-span-2"><label for="diagnosis-recommendation">Recomendação</label><textarea id="diagnosis-recommendation" name="recommendation" maxlength="2000"></textarea></div><div class="field form-span-2"><label for="diagnosis-internal">Observação interna</label><textarea id="diagnosis-internal" name="internalNotes" maxlength="5000"></textarea><span class="field-hint">Nunca é enviada à área do cliente.</span></div><button class="btn btn-primary form-span-2" type="submit" data-loading-label="Salvando...">Salvar diagnóstico</button></form><div class="card-footer stack"><div class="split"><div><h3 class="card-title">Fotos e vídeos</h3><p class="small muted">Imagens até 8 MB; vídeos até 50 MB.</p></div></div><form id="media-form" class="form-grid"><div class="field"><label for="media-file">Arquivo</label><input id="media-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" required></div><div class="field"><label for="media-caption">Legenda</label><input id="media-caption" name="caption" maxlength="300"></div><div class="form-span-2 progress" id="media-progress" hidden><span></span></div><button class="btn btn-secondary form-span-2" type="submit" data-loading-label="Enviando...">Enviar mídia</button></form><div class="media-grid" id="order-media"></div></div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Orçamento</h2><p class="small muted">Cada envio cria uma nova versão imutável.</p></div></div><div id="current-estimate" class="table-wrap"></div><details><summary class="card-body"><strong>Criar nova versão</strong></summary><form id="estimate-form"><div id="estimate-items"></div><div class="card-body form-grid"><div class="field"><label for="estimate-discount">Desconto (R$)</label><input id="estimate-discount" name="discount" inputmode="decimal" value="0,00"></div><div class="field"><label>&nbsp;</label><button class="btn btn-secondary" id="add-estimate-item" type="button">+ Adicionar item</button></div><button class="btn btn-primary form-span-2" type="submit" data-loading-label="Enviando orçamento...">Enviar orçamento para aprovação</button></div></form></details></article></div><aside class="detail-side"><article class="card"><div class="card-header"><h2 class="card-title">Veículo e cliente</h2></div><div class="card-body stack"><div><span class="small muted">Cliente</span><strong id="detail-customer" class="stack"></strong></div><div><span class="small muted">Veículo</span><strong id="detail-vehicle" class="stack"></strong></div><div><span class="small muted">Relato de entrada</span><p id="detail-complaint"></p></div></div></article><article class="card"><div class="card-header"><h2 class="card-title">Atualizar status</h2></div><form id="status-form" class="card-body stack"><div class="field"><label for="next-status">Próxima etapa</label><select id="next-status" name="nextStatus"></select></div><button class="btn btn-primary" type="submit" data-loading-label="Atualizando...">Registrar mudança</button></form></article><article class="card"><div class="card-header"><h2 class="card-title">Acompanhamento</h2></div><div class="card-body stack"><p class="small muted">Gere um token longo, revogável e limitado a esta ordem.</p><button class="btn btn-secondary" id="share-order" type="button" data-loading-label="Gerando...">Gerar link seguro</button><div class="field" id="share-result" hidden><label for="share-url">Link do cliente</label><input id="share-url" readonly><button class="btn btn-secondary" id="copy-share" type="button">Copiar link</button></div></div></article><article class="card"><div class="card-header"><h2 class="card-title">Pagamento</h2></div><form id="payment-form" class="card-body stack"><div class="field"><label for="payment-amount">Valor recebido (R$)</label><input id="payment-amount" name="amount" inputmode="decimal" required></div><div class="field"><label for="payment-method">Forma</label><select id="payment-method" name="method"><option value="PIX">PIX</option><option value="CASH">Dinheiro</option><option value="CREDIT">Crédito</option><option value="DEBIT">Débito</option><option value="TRANSFER">Transferência</option><option value="OTHER">Outro</option></select></div><div class="field"><label for="payment-note">Observação</label><input id="payment-note" name="note" maxlength="500"></div><button class="btn btn-primary" type="submit" data-loading-label="Registrando...">Registrar pagamento</button></form><div class="card-footer"><p class="small muted">Total registrado</p><strong id="paid-total">R$ 0,00</strong></div></article></aside></section>`;
}

export async function initOrderDetail(context) {
  const orderId = new URLSearchParams(location.search).get("id");
  if (!validFirebaseId(orderId)) throw new Error("Identificador da ordem inválido.");
  const main = document.querySelector("#main-content");

  async function refresh() {
    const bundle = await getOrderBundle(context.workshopId, orderId);
    if (!bundle) throw new Error("Ordem de serviço não encontrada.");
    main.innerHTML = detailTemplate();
    const {order, customer, vehicle, diagnosis, estimates, payments, events, shareLinks} = bundle;
    const role = context.membership.role;
    document.title = `${order.orderNumberDisplay} | Oficlaro`;
    document.querySelector("#order-number").textContent = order.orderNumberDisplay;
    document.querySelector("#order-title").textContent = `${vehicle?.brand || ""} ${vehicle?.model || ""}`.trim() || "Ordem de serviço";
    document.querySelector("#order-subtitle").textContent = `${customer?.name || "Cliente"} · Entrada ${formatDate(order.createdAt)}`;
    const badge = document.querySelector("#order-status"); badge.textContent = statusLabel(order.status); badge.dataset.tone = statusTone(order.status);
    document.querySelector("#detail-customer").textContent = customer?.name || "—";
    document.querySelector("#detail-vehicle").textContent = vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year} · ${vehicle.plate} · ${Number(order.initialMileage || 0).toLocaleString("pt-BR")} km` : "—";
    document.querySelector("#detail-complaint").textContent = order.customerComplaint || "—";
    document.querySelector("#paid-total").textContent = formatCurrency(payments.reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0));
    const activeLinks = shareLinks.filter((link) => link.active && Number(link.expiresAt) > Date.now());
    renderTimeline(document.querySelector("#order-timeline"), events);
    if (diagnosis) {
      document.querySelector("#diagnosis-title").value = diagnosis.title || "";
      document.querySelector("#diagnosis-severity").value = diagnosis.severity || "MEDIUM";
      document.querySelector("#diagnosis-customer").value = diagnosis.customerDescription || "";
      document.querySelector("#diagnosis-recommendation").value = diagnosis.recommendation || "";
      document.querySelector("#diagnosis-internal").value = diagnosis.internalNotes || "";
    }
    await renderMedia(document.querySelector("#order-media"), diagnosis?.media);
    const currentEstimate = order.currentEstimateVersion ? estimates[String(order.currentEstimateVersion)] : null;
    renderEstimate(document.querySelector("#current-estimate"), currentEstimate);
    if (!["OWNER", "MANAGER", "MECHANIC"].includes(role)) document.querySelector("#diagnosis-form").closest("article").hidden = true;
    if (!["OWNER", "MANAGER", "MECHANIC", "ATTENDANT"].includes(role)) document.querySelector("#status-form").closest("article").hidden = true;
    if (!["OWNER", "MANAGER", "ATTENDANT", "FINANCIAL"].includes(role)) document.querySelector("#estimate-form").closest("article").hidden = true;
    if (!["OWNER", "MANAGER", "ATTENDANT"].includes(role)) document.querySelector("#share-order").closest("article").hidden = true;
    if (!["OWNER", "MANAGER", "FINANCIAL"].includes(role)) document.querySelector("#payment-form").closest("article").hidden = true;
    const nextSelect = document.querySelector("#next-status");
    nextSelect.replaceChildren(new Option("Selecione a próxima etapa", ""));
    (NEXT_STATUS[order.status] || []).forEach((status) => nextSelect.add(new Option(statusLabel(status), status)));
    document.querySelector("#status-form").querySelector("button").disabled = !(NEXT_STATUS[order.status] || []).length;

    document.querySelector("#status-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button");
      try { const nextStatus = nextSelect.value; if (!nextStatus) throw new Error("Selecione a próxima etapa."); if (!await confirmAction({title: "Registrar mudança de status?", message: `${statusLabel(order.status)} → ${statusLabel(nextStatus)}`, confirmLabel: "Registrar"})) return; setButtonLoading(button, true); await callBackend("changeOrderStatus", {workshopId: context.workshopId, orderId, nextStatus, expectedStatus: order.status}); showToast("Status atualizado e evento registrado.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); }
    });
    document.querySelector("#diagnosis-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']"); setButtonLoading(button, true);
      try { const data = Object.fromEntries(new FormData(event.currentTarget)); await callBackend("upsertDiagnosis", {workshopId: context.workshopId, orderId, title: requiredText(data.title, "Título", {min: 3, max: 140}), customerDescription: requiredText(data.customerDescription, "Descrição para o cliente", {min: 5, max: 3000}), recommendation: optionalText(data.recommendation, "Recomendação", {max: 2000}), internalNotes: optionalText(data.internalNotes, "Observação interna", {max: 5000}), severity: data.severity}); showToast("Diagnóstico salvo.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); }
    });
    document.querySelector("#media-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']"); const file = event.currentTarget.elements.file.files[0]; const progress = document.querySelector("#media-progress");
      try { if (!file) throw new Error("Selecione uma foto ou vídeo."); setButtonLoading(button, true); progress.hidden = false; await uploadOrderMedia(context, orderId, file, event.currentTarget.elements.caption.value, (percent) => { progress.dataset.progress = String(Math.min(100, Math.ceil(percent / 10) * 10)); }); showToast("Mídia enviada e vinculada ao diagnóstico.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); progress.hidden = true; }
    });
    const itemsContainer = document.querySelector("#estimate-items"); addEstimateItem(itemsContainer);
    document.querySelector("#add-estimate-item").addEventListener("click", () => addEstimateItem(itemsContainer));
    document.querySelector("#estimate-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']");
      try { const items = collectEstimateItems(itemsContainer); const discountCents = parseCurrencyToCents(document.querySelector("#estimate-discount").value); if (!Number.isSafeInteger(discountCents)) throw new Error("Informe um desconto válido."); if (!await confirmAction({title: "Enviar orçamento?", message: "Uma nova versão imutável ficará disponível para decisão do cliente.", confirmLabel: "Enviar"})) return; setButtonLoading(button, true); await callBackend("createEstimate", {workshopId: context.workshopId, orderId, items, discountCents}); showToast("Orçamento enviado.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); }
    });
    document.querySelector("#share-order").addEventListener("click", async (event) => {
      const button = event.currentTarget; setButtonLoading(button, true);
      try { const result = await callBackend("createShareLink", {workshopId: context.workshopId, orderId, baseUrl: location.origin, expiresInDays: 30}); const wrapper = document.querySelector("#share-result"); wrapper.hidden = false; document.querySelector("#share-url").value = result.url; document.querySelector("#copy-share").disabled = false; showToast("Link seguro gerado.", "success"); } catch (error) { showToast(friendlyError(error), "error"); } finally { setButtonLoading(button, false); }
    });
    if (activeLinks.length) {
      const wrapper = document.querySelector("#share-result");
      wrapper.hidden = false;
      document.querySelector("#share-url").value = "Token completo exibido somente na criação";
      document.querySelector("#copy-share").disabled = true;
      const notice = document.createElement("p"); notice.className = "small muted"; notice.textContent = `${activeLinks.length} link(s) ativo(s). O token completo só é exibido no momento da criação.`;
      const revoke = document.createElement("button"); revoke.className = "btn btn-danger"; revoke.type = "button"; revoke.textContent = "Revogar links ativos";
      revoke.addEventListener("click", async () => {
        try {
          if (!await confirmAction({title: "Revogar links?", message: "O acesso do cliente será interrompido imediatamente.", confirmLabel: "Revogar", danger: true})) return;
          setButtonLoading(revoke, true);
          for (const link of activeLinks) await callBackend("revokeShareLink", {workshopId: context.workshopId, orderId, shareId: link.id});
          showToast("Links revogados.", "success");
          await refresh();
        } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(revoke, false); }
      });
      wrapper.append(notice, revoke);
    }
    document.querySelector("#copy-share").addEventListener("click", async () => { try { await navigator.clipboard.writeText(document.querySelector("#share-url").value); showToast("Link copiado.", "success"); } catch { showToast("Não foi possível copiar automaticamente. Selecione o link.", "error"); } });
    document.querySelector("#payment-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']");
      try { const data = Object.fromEntries(new FormData(event.currentTarget)); const amountCents = parseCurrencyToCents(data.amount); if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Informe um valor recebido válido."); if (!await confirmAction({title: "Registrar pagamento?", message: `${formatCurrency(amountCents)} será adicionado ao histórico financeiro desta ordem.`, confirmLabel: "Registrar"})) return; setButtonLoading(button, true); await callBackend("recordPayment", {workshopId: context.workshopId, orderId, amountCents, method: data.method, note: data.note}); showToast("Pagamento registrado.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); }
    });
  }

  await refresh();
}
