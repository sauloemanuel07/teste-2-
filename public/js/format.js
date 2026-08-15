export const STATUS_LABELS = Object.freeze({
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
});

export const NEXT_STATUS = Object.freeze({
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: ["DIAGNOSED", "WAITING_PARTS", "CANCELLED"],
  DIAGNOSED: ["AWAITING_APPROVAL", "WAITING_PARTS", "CANCELLED"],
  AWAITING_APPROVAL: ["IN_PROGRESS", "WAITING_PARTS", "CANCELLED"],
  WAITING_PARTS: ["DIAGNOSING", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "FINAL_TESTS", "CANCELLED"],
  FINAL_TESTS: ["IN_PROGRESS", "READY"],
  READY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: []
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {dateStyle: "short", timeStyle: "short"});

export function formatCurrency(cents = 0) {
  return currencyFormatter.format(Number(cents || 0) / 100);
}

export function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.valueOf()) ? "—" : dateFormatter.format(date);
}

export function formatPhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return value || "—";
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

export function statusTone(status) {
  if (["DELIVERED", "READY"].includes(status)) return "success";
  if (["CANCELLED"].includes(status)) return "danger";
  if (["AWAITING_APPROVAL", "WAITING_PARTS"].includes(status)) return "warning";
  if (["DIAGNOSING", "DIAGNOSED", "IN_PROGRESS", "FINAL_TESTS"].includes(status)) return "info";
  return "violet";
}

export function initials(name) {
  return String(name || "OF").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "OF";
}

export function normalizeForSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseCurrencyToCents(value) {
  const normalized = String(value || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return NaN;
  return Math.round(amount * 100);
}

