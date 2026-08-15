import {normalizePhone, normalizePlate} from "./format.js";

export function requiredText(value, label, {min = 2, max = 500} = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length < min) throw new Error(`${label} deve ter pelo menos ${min} caracteres.`);
  if (text.length > max) throw new Error(`${label} deve ter no máximo ${max} caracteres.`);
  return text;
}

export function optionalText(value, label, {max = 500} = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length > max) throw new Error(`${label} deve ter no máximo ${max} caracteres.`);
  return text;
}

export function validPhone(value) {
  const phone = normalizePhone(value);
  if (phone.length < 10 || phone.length > 13) throw new Error("Informe um telefone válido com DDD.");
  return phone;
}

export function validPlate(value) {
  const plate = normalizePlate(value);
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) throw new Error("Informe uma placa brasileira válida.");
  return plate;
}

export function validYear(value) {
  const year = Number(value);
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1900 || year > maxYear) throw new Error("Informe um ano válido.");
  return year;
}

export function validMileage(value) {
  const mileage = Number(value);
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > 5000000) throw new Error("Informe uma quilometragem válida.");
  return mileage;
}

export function validEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  return email;
}

