import test, {after, before} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {assertFails, assertSucceeds, initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {get, ref, set} from "firebase/database";
import {getBytes, ref as storageRef, uploadBytes} from "firebase/storage";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "oficlaro-rules-test",
    database: {rules: await readFile(new URL("../database.rules.json", import.meta.url), "utf8")},
    storage: {rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8")}
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await set(ref(db), {
      workshops: {workshopA: {id: "workshopA", name: "A", ownerUid: "ownerA", plan: "BASIC", status: "TRIAL", createdAt: 1, updatedAt: 1}, workshopB: {id: "workshopB", name: "B", ownerUid: "ownerB", plan: "BASIC", status: "TRIAL", createdAt: 1, updatedAt: 1}},
      workshopUsers: {workshopA: {ownerA: {uid: "ownerA", role: "OWNER", active: true, createdAt: 1, updatedAt: 1}}, workshopB: {ownerB: {uid: "ownerB", role: "OWNER", active: true, createdAt: 1, updatedAt: 1}}},
      customers: {workshopA: {customerA: {id: "customerA", workshopId: "workshopA", name: "João", nameNormalized: "joao", phone: "11999998888", phoneNormalized: "11999998888", email: "", document: "", notes: "", active: true, createdAt: 1, createdBy: "ownerA", updatedAt: 1}}},
      shareLinks: {workshopA: {orderA: {shareA: {active: true, expiresAt: Date.now() + 3600000}}}},
      publicOrderViews: {workshopA: {orderA: {order: {id: "orderA", status: "RECEIVED"}}}}
    });
  });
});

after(async () => environment?.cleanup());

test("membro lê dados da própria oficina", async () => {
  const db = environment.authenticatedContext("ownerA").database();
  const snapshot = await assertSucceeds(get(ref(db, "customers/workshopA/customerA")));
  assert.equal(snapshot.val().name, "João");
});

test("usuário da oficina A não lê a oficina B", async () => {
  const db = environment.authenticatedContext("ownerA").database();
  await assertFails(get(ref(db, "customers/workshopB")));
});

test("usuário não autenticado não lê clientes", async () => {
  const db = environment.unauthenticatedContext().database();
  await assertFails(get(ref(db, "customers/workshopA")));
});

test("atendente cria cliente na própria oficina, mas não altera o tenant", async () => {
  const ownDb = environment.authenticatedContext("ownerA").database();
  await assertSucceeds(set(ref(ownDb, "customers/workshopA/customerB"), {
    id: "customerB", workshopId: "workshopA", name: "Maria", nameNormalized: "maria",
    phone: "11911112222", phoneNormalized: "11911112222", active: true,
    createdAt: 2, createdBy: "ownerA", updatedAt: 2
  }));
  await assertFails(set(ref(ownDb, "customers/workshopB/customerX"), {
    id: "customerX", workshopId: "workshopB", name: "Intruso", nameNormalized: "intruso",
    phone: "11911113333", phoneNormalized: "11911113333", active: true,
    createdAt: 2, createdBy: "ownerA", updatedAt: 2
  }));
  await assertFails(set(ref(ownDb, "customers/workshopA/customerUnexpected"), {
    id: "customerUnexpected", workshopId: "workshopA", name: "Campo extra", nameNormalized: "campo extra",
    phone: "11911114444", phoneNormalized: "11911114444", active: true,
    createdAt: 2, createdBy: "ownerA", updatedAt: 2, isAdmin: true
  }));
});

test("veículo válido exige proprietário ativo na mesma oficina", async () => {
  const ownDb = environment.authenticatedContext("ownerA").database();
  await assertSucceeds(set(ref(ownDb, "vehicles/workshopA/vehicleA"), {
    id: "vehicleA", workshopId: "workshopA", ownerId: "customerA",
    plate: "ABC1D23", plateNormalized: "ABC1D23", brand: "Fiat", model: "Argo",
    year: 2024, mileage: 12000, active: true, createdAt: 2, createdBy: "ownerA", updatedAt: 2
  }));
  await assertFails(set(ref(ownDb, "vehicles/workshopA/vehicleOrphan"), {
    id: "vehicleOrphan", workshopId: "workshopA", ownerId: "missingCustomer",
    plate: "DEF4G56", plateNormalized: "DEF4G56", brand: "Ford", model: "Ka",
    year: 2020, mileage: 50000, active: true, createdAt: 2, createdBy: "ownerA", updatedAt: 2
  }));
});

test("link público lê somente a visão e a OS contidas nas claims", async () => {
  const customerDb = environment.authenticatedContext("customerSession", {
    role: "CUSTOMER", workshopId: "workshopA", orderId: "orderA", shareId: "shareA"
  }).database();
  await assertSucceeds(get(ref(customerDb, "publicOrderViews/workshopA/orderA")));
  await assertFails(get(ref(customerDb, "publicOrderViews/workshopA/orderB")));
  await assertFails(get(ref(customerDb, "customers/workshopA")));
});

test("Storage aceita mídia válida do tenant e nega MIME e tenant incorretos", async () => {
  const ownerStorage = environment.authenticatedContext("ownerA", {workshopId: "workshopA", role: "OWNER"}).storage();
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const metadata = {contentType: "image/png", customMetadata: {ownerUid: "ownerA", workshopId: "workshopA", orderId: "orderA"}};
  const validRef = storageRef(ownerStorage, "workshops/workshopA/orders/orderA/images/photo.png");
  await assertSucceeds(uploadBytes(validRef, bytes, metadata));
  await assertSucceeds(getBytes(validRef));
  await assertFails(uploadBytes(
    storageRef(ownerStorage, "workshops/workshopA/orders/orderA/images/payload.txt"),
    bytes,
    {...metadata, contentType: "text/plain"}
  ));
  await assertFails(uploadBytes(
    storageRef(ownerStorage, "workshops/workshopB/orders/orderA/images/photo.png"),
    bytes,
    {...metadata, customMetadata: {...metadata.customMetadata, workshopId: "workshopB"}}
  ));
});
