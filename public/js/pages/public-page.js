import {signInWithCustomToken} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {onValue, ref as databaseRef} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import {httpsCallable} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-functions.js";
import {getBlob, ref as storageRef} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import {publicFirebaseReady} from "../public-firebase.js";
import {formatCurrency, formatDate, statusLabel, statusTone} from "../format.js";
import {confirmAction, friendlyError, setButtonLoading, showMessage, showToast} from "../ui.js";

const token = new URLSearchParams(location.search).get("token") || "";
const errorElement = document.querySelector("#public-error");

function requestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function callBackend(name, data = {}) {
  const {functions} = await publicFirebaseReady;
  const result = await httpsCallable(functions, name)({...data, requestId: data.requestId || requestId()});
  return result.data;
}

async function mediaObjectUrl(path) {
  const {storage} = await publicFirebaseReady;
  const blob = await getBlob(storageRef(storage, path), 55 * 1024 * 1024);
  return URL.createObjectURL(blob);
}

async function subscribePublicOrder(workshopId, orderId, callback, onError) {
  const {database} = await publicFirebaseReady;
  return onValue(databaseRef(database, `publicOrderViews/${workshopId}/${orderId}`), (snapshot) => callback(snapshot.val()), onError);
}

function validToken(value) {
  return /^[A-Za-z0-9_-]{40,100}$/.test(value);
}

function renderTimeline(container, timeline) {
  const events = Object.values(timeline || {}).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  container.replaceChildren();
  events.forEach((event) => {
    const item = document.createElement("li"); item.className = "timeline-item";
    const text = document.createElement("strong"); text.textContent = event.description || statusLabel(event.newStatus);
    const time = document.createElement("time"); time.textContent = formatDate(event.createdAt); time.dateTime = new Date(event.createdAt).toISOString();
    item.append(text, time); container.append(item);
  });
}

async function renderMedia(container, media) {
  container.replaceChildren();
  for (const item of Object.values(media || {})) {
    const figure = document.createElement("figure"); figure.className = "media-card";
    try {
      const url = await mediaObjectUrl(item.storagePath);
      const element = item.type === "VIDEO" ? document.createElement("video") : document.createElement("img");
      element.src = url;
      if (item.type === "VIDEO") element.controls = true; else element.alt = item.caption || "Foto do diagnóstico";
      figure.append(element);
    } catch {
      const fallback = document.createElement("span"); fallback.className = "small muted"; fallback.textContent = "Mídia indisponível"; figure.append(fallback);
    }
    container.append(figure);
  }
}

function renderEstimate(container, estimate) {
  container.replaceChildren();
  if (!estimate) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "A oficina ainda não enviou um orçamento."; container.append(p); return; }
  const form = document.createElement("form"); form.id = "public-estimate-form"; form.className = "stack";
  Object.values(estimate.items || {}).forEach((item) => {
    const wrapper = document.createElement("div"); wrapper.className = "estimate-item";
    const description = document.createElement("strong"); description.textContent = item.description;
    const price = document.createElement("strong"); price.textContent = formatCurrency(item.totalCents);
    wrapper.append(description, price);
    const detail = document.createElement("p"); detail.className = "small muted"; detail.textContent = `${item.quantity} × ${formatCurrency(item.unitPriceCents)}`; wrapper.append(detail);
    const existing = estimate.approval?.[item.id]?.decision;
    if (estimate.status === "SENT") {
      const controls = document.createElement("div"); controls.className = "decision-control";
      [["APPROVED", "Aprovar"], ["REJECTED", "Recusar"]].forEach(([value, label]) => {
        const optionLabel = document.createElement("label"); const radio = document.createElement("input"); radio.type = "radio"; radio.name = `decision-${item.id}`; radio.value = value; radio.required = true; optionLabel.append(radio, document.createTextNode(label)); controls.append(optionLabel);
      });
      wrapper.append(controls);
    } else {
      const result = document.createElement("span"); result.className = "badge"; result.dataset.tone = existing === "APPROVED" ? "success" : "danger"; result.textContent = existing === "APPROVED" ? "Aprovado" : existing === "REJECTED" ? "Recusado" : estimate.status; wrapper.append(result);
    }
    form.append(wrapper);
  });
  const total = document.createElement("div"); total.className = "split"; const label = document.createElement("strong"); label.textContent = "Total do orçamento"; const value = document.createElement("strong"); value.textContent = formatCurrency(estimate.totalCents); total.append(label, value); form.append(total);
  if (estimate.status === "SENT") {
    const note = document.createElement("p"); note.className = "alert"; note.textContent = "Revise cada item. Depois de confirmada, sua decisão ficará registrada com data e hora.";
    const button = document.createElement("button"); button.className = "btn btn-primary btn-block"; button.type = "submit"; button.dataset.loadingLabel = "Confirmando..."; button.textContent = "Confirmar decisões"; form.append(note, button);
  }
  container.append(form);
  return form;
}

async function renderPublicView(view) {
  if (!view) throw new Error("O acompanhamento ainda não está disponível.");
  document.querySelector("#public-workshop").textContent = view.workshop?.name || "Oficina";
  const main = document.querySelector("#main-content");
  main.innerHTML = `<section class="hero-status"><span class="eyebrow">Status atual</span><h1 id="public-status"></h1><p id="public-vehicle"></p></section><div class="public-grid"><article class="card"><div class="card-header"><div><h2 class="card-title">Acompanhamento</h2><p class="small muted" id="public-order-number"></p></div></div><div class="card-body"><ol class="timeline" id="public-timeline"></ol></div></article><article class="card" id="public-diagnosis-card"><div class="card-header"><h2 class="card-title">Diagnóstico</h2></div><div class="card-body stack"><h3 id="public-diagnosis-title"></h3><p id="public-diagnosis-description"></p><p id="public-diagnosis-recommendation" class="muted"></p><div class="media-grid" id="public-media"></div></div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Orçamento</h2><p class="small muted">Aprovação item a item, registrada com segurança</p></div></div><div class="card-body" id="public-estimate"></div></article><article class="card"><div class="card-header"><h2 class="card-title">Contato da oficina</h2></div><div class="card-body stack"><strong id="public-contact-name"></strong><p id="public-contact"></p></div></article></div>`;
  document.querySelector("#public-status").textContent = statusLabel(view.order?.status);
  document.querySelector("#public-vehicle").textContent = `${view.vehicle?.brand || ""} ${view.vehicle?.model || ""} ${view.vehicle?.year || ""} · ${view.vehicle?.plate || ""}`.trim();
  document.querySelector("#public-order-number").textContent = `${view.order?.orderNumberDisplay || "Ordem"} · Atualizado ${formatDate(view.updatedAt)}`;
  renderTimeline(document.querySelector("#public-timeline"), view.timeline);
  const diagnosisCard = document.querySelector("#public-diagnosis-card");
  if (!view.diagnosis) diagnosisCard.hidden = true;
  else {
    document.querySelector("#public-diagnosis-title").textContent = view.diagnosis.title || "Diagnóstico";
    document.querySelector("#public-diagnosis-description").textContent = view.diagnosis.description || "";
    document.querySelector("#public-diagnosis-recommendation").textContent = view.diagnosis.recommendation || "";
    await renderMedia(document.querySelector("#public-media"), view.diagnosis.media);
  }
  const estimateForm = renderEstimate(document.querySelector("#public-estimate"), view.estimate);
  estimateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    try {
      const decisions = {};
      for (const item of Object.values(view.estimate.items || {})) {
        const selected = event.currentTarget.querySelector(`input[name="decision-${CSS.escape(item.id)}"]:checked`);
        if (!selected) throw new Error("Escolha aprovar ou recusar em todos os itens.");
        decisions[item.id] = selected.value;
      }
      if (!await confirmAction({title: "Confirmar decisões?", message: "A oficina receberá sua resposta e ela não poderá ser alterada silenciosamente.", confirmLabel: "Confirmar"})) return;
      setButtonLoading(button, true);
      await callBackend("decideEstimate", {decisions});
      showToast("Decisões registradas com sucesso.", "success");
    } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); }
  });
  document.querySelector("#public-contact-name").textContent = view.workshop?.name || "Oficina";
  document.querySelector("#public-contact").textContent = view.workshop?.whatsapp || view.workshop?.phone || view.workshop?.email || "Contato não informado";
}

try {
  if (!validToken(token)) throw new Error("O link informado é inválido.");
  const exchange = await callBackend("exchangeShareToken", {token});
  const {auth} = await publicFirebaseReady;
  await signInWithCustomToken(auth, exchange.customToken);
  await subscribePublicOrder(exchange.workshopId, exchange.orderId, (view) => renderPublicView(view).catch((error) => showToast(friendlyError(error), "error")), (error) => showToast(friendlyError(error), "error"));
} catch (error) {
  showMessage(errorElement, friendlyError(error));
}
