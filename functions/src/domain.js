"use strict";

const ORDER_STATUS = Object.freeze({
  RECEIVED: "RECEIVED",
  DIAGNOSING: "DIAGNOSING",
  DIAGNOSED: "DIAGNOSED",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  WAITING_PARTS: "WAITING_PARTS",
  IN_PROGRESS: "IN_PROGRESS",
  FINAL_TESTS: "FINAL_TESTS",
  READY: "READY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED"
});

const STATUS_TRANSITIONS = Object.freeze({
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

const CUSTOMER_VISIBLE_STATUSES = new Set(Object.values(ORDER_STATUS));
const TERMINAL_STATUSES = new Set([ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED]);

function cleanText(value, { min = 0, max = 500, label = "Campo" } = {}) {
  if (typeof value !== "string") throw new TypeError(`${label} deve ser texto.`);
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < min) throw new RangeError(`${label} deve ter pelo menos ${min} caracteres.`);
  if (cleaned.length > max) throw new RangeError(`${label} deve ter no máximo ${max} caracteres.`);
  return cleaned;
}

function cleanOptionalText(value, options = {}) {
  if (value == null || value === "") return "";
  return cleanText(value, options);
}

function normalizePhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 13) throw new RangeError("Telefone inválido.");
  return phone;
}

function normalizePlate(value) {
  const plate = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) throw new RangeError("Placa inválida.");
  return plate;
}

function assertPositiveInteger(value, label, { allowZero = true, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > max) {
    throw new RangeError(`${label} inválido.`);
  }
  return value;
}

function canTransition(previousStatus, nextStatus) {
  return Boolean(STATUS_TRANSITIONS[previousStatus]?.includes(nextStatus));
}

function calculateEstimate(items, discountCents = 0) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new RangeError("O orçamento precisa ter entre 1 e 100 itens.");
  }
  const normalizedItems = items.map((item, index) => {
    const quantity = assertPositiveInteger(Number(item.quantity), `Quantidade do item ${index + 1}`, {allowZero: false, max: 10000});
    const unitPriceCents = assertPositiveInteger(Number(item.unitPriceCents), `Valor do item ${index + 1}`, {max: 100000000});
    const totalCents = quantity * unitPriceCents;
    if (!Number.isSafeInteger(totalCents)) throw new RangeError("Total do item excede o limite permitido.");
    return {
      id: cleanText(String(item.id || `item-${index + 1}`), {min: 1, max: 80, label: "ID do item"}),
      type: ["SERVICE", "PART", "LABOR"].includes(item.type) ? item.type : "SERVICE",
      description: cleanText(item.description, {min: 2, max: 180, label: "Descrição"}),
      quantity,
      unitPriceCents,
      totalCents
    };
  });
  const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.totalCents, 0);
  const safeDiscount = assertPositiveInteger(Number(discountCents || 0), "Desconto", {max: subtotalCents});
  return {items: normalizedItems, subtotalCents, discountCents: safeDiscount, totalCents: subtotalCents - safeDiscount};
}

function safeBaseUrl(value) {
  const url = new URL(String(value || ""));
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new RangeError("Origem pública inválida.");
  }
  return url.origin;
}

module.exports = {
  CUSTOMER_VISIBLE_STATUSES,
  ORDER_STATUS,
  STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  assertPositiveInteger,
  calculateEstimate,
  canTransition,
  cleanOptionalText,
  cleanText,
  normalizePhone,
  normalizePlate,
  safeBaseUrl
};

