import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {
  calculateEstimate,
  canTransition,
  normalizePhone,
  normalizePlate,
  safeBaseUrl
} = require("../functions/src/domain.js");

test("permite apenas transições válidas da ordem", () => {
  assert.equal(canTransition("RECEIVED", "DIAGNOSING"), true);
  assert.equal(canTransition("RECEIVED", "READY"), false);
  assert.equal(canTransition("DELIVERED", "IN_PROGRESS"), false);
});

test("calcula orçamento em centavos sem ponto flutuante", () => {
  const estimate = calculateEstimate([
    {id: "part", type: "PART", description: "Pastilhas dianteiras", quantity: 1, unitPriceCents: 18990},
    {id: "labor", type: "LABOR", description: "Mão de obra", quantity: 2, unitPriceCents: 7500}
  ], 990);
  assert.equal(estimate.subtotalCents, 33990);
  assert.equal(estimate.totalCents, 33000);
  assert.equal(estimate.items[1].totalCents, 15000);
});

test("rejeita desconto maior que o subtotal", () => {
  assert.throws(() => calculateEstimate([{id: "x", description: "Serviço", quantity: 1, unitPriceCents: 1000}], 1001));
});

test("normaliza telefone e placas brasileiras", () => {
  assert.equal(normalizePhone("(11) 99999-8888"), "11999998888");
  assert.equal(normalizePlate("abc-1d23"), "ABC1D23");
  assert.equal(normalizePlate("abc-1234"), "ABC1234");
});

test("aceita somente origens HTTPS ou localhost", () => {
  assert.equal(safeBaseUrl("https://oficlaro-a632c.web.app/path"), "https://oficlaro-a632c.web.app");
  assert.equal(safeBaseUrl("http://localhost:5000/foo"), "http://localhost:5000");
  assert.throws(() => safeBaseUrl("http://example.com"));
});

