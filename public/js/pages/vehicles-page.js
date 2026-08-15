import {archiveVehicle, listCustomers, listVehicles, saveVehicle, searchVehicles} from "../data.js";
import {formatDate} from "../format.js";
import {confirmAction, emptyState, friendlyError, setButtonLoading, showToast} from "../ui.js";

function customerOptions(select, customers) {
  select.replaceChildren(new Option("Selecione o proprietário", ""));
  customers.forEach((customer) => select.add(new Option(customer.name, customer.id)));
}

function renderRows(container, vehicles, customersById, context, refresh) {
  container.replaceChildren();
  if (!vehicles.length) { container.append(emptyState({title: "Nenhum veículo encontrado", description: "Cadastre um veículo vinculado a um cliente ativo."})); return; }
  const table = document.createElement("table"); table.className = "data-table";
  table.innerHTML = "<thead><tr><th>Veículo</th><th>Placa</th><th>Proprietário</th><th>Quilometragem</th><th>Cadastro</th><th>Ação</th></tr></thead>";
  const body = document.createElement("tbody");
  vehicles.forEach((vehicle) => {
    const row = document.createElement("tr");
    [`${vehicle.brand} ${vehicle.model} ${vehicle.year}`, vehicle.plate, customersById.get(vehicle.ownerId)?.name || "—", `${Number(vehicle.mileage || 0).toLocaleString("pt-BR")} km`, formatDate(vehicle.createdAt)].forEach((text) => { const cell = document.createElement("td"); cell.textContent = text; row.append(cell); });
    const actionCell = document.createElement("td"); const archive = document.createElement("button"); archive.className = "btn btn-secondary"; archive.type = "button"; archive.textContent = "Arquivar";
    archive.addEventListener("click", async () => { if (!await confirmAction({title: "Arquivar veículo?", message: "As ordens e o prontuário do veículo serão preservados.", confirmLabel: "Arquivar", danger: true})) return; try { await archiveVehicle(context, vehicle.id); showToast("Veículo arquivado.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); } });
    if (["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) actionCell.append(archive);
    else actionCell.textContent = "Somente leitura";
    row.append(actionCell); body.append(row);
  });
  table.append(body); container.append(table);
}

export async function initVehicles(context) {
  const main = document.querySelector("#main-content");
  main.innerHTML = `<header class="page-header"><div><span class="eyebrow">Prontuário digital</span><h1>Veículos</h1><p>Veículos sempre vinculados a clientes da mesma oficina.</p></div></header><section class="two-column"><article class="card"><div class="card-header"><h2 class="card-title">Novo veículo</h2></div><form id="vehicle-form" class="card-body form-grid" novalidate><div class="field form-span-2"><label for="vehicle-owner">Proprietário</label><select id="vehicle-owner" name="ownerId" required></select></div><div class="field"><label for="vehicle-plate">Placa</label><input id="vehicle-plate" name="plate" required maxlength="8" placeholder="ABC1D23"></div><div class="field"><label for="vehicle-year">Ano</label><input id="vehicle-year" name="year" type="number" min="1900" max="2100" required></div><div class="field"><label for="vehicle-brand">Marca</label><input id="vehicle-brand" name="brand" required maxlength="80"></div><div class="field"><label for="vehicle-model">Modelo</label><input id="vehicle-model" name="model" required maxlength="80"></div><div class="field"><label for="vehicle-version">Versão</label><input id="vehicle-version" name="version" maxlength="100"></div><div class="field"><label for="vehicle-color">Cor</label><input id="vehicle-color" name="color" maxlength="50"></div><div class="field"><label for="vehicle-mileage">Quilometragem</label><input id="vehicle-mileage" name="mileage" type="number" min="0" max="5000000" required></div><div class="field"><label for="vehicle-fuel">Combustível</label><input id="vehicle-fuel" name="fuel" maxlength="30"></div><div class="field form-span-2"><label for="vehicle-notes">Observações</label><textarea id="vehicle-notes" name="notes" maxlength="2000"></textarea></div><button class="btn btn-primary form-span-2" type="submit" data-loading-label="Salvando...">Cadastrar veículo</button></form></article><article class="card"><div class="card-header"><div><h2 class="card-title">Veículos ativos</h2><p class="small muted">Até 50 resultados por vez</p></div></div><div class="card-body"><label class="field search-control"><span class="field-label">Buscar por placa</span><input id="vehicle-search" type="search" maxlength="8" placeholder="ABC1D23"></label></div><div id="vehicles-table" class="table-wrap"></div></article></section>`;
  const customers = await listCustomers(context.workshopId, 100);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  customerOptions(document.querySelector("#vehicle-owner"), customers);
  if (!["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) main.querySelector("#vehicle-form").closest("article").hidden = true;
  const container = document.querySelector("#vehicles-table");
  const refresh = async () => renderRows(container, await listVehicles(context.workshopId), customerMap, context, refresh);
  await refresh();
  document.querySelector("#vehicle-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']"); setButtonLoading(button, true);
    try { await saveVehicle(context, Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); customerOptions(document.querySelector("#vehicle-owner"), customers); showToast("Veículo cadastrado com sucesso.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); } finally { setButtonLoading(button, false); }
  });
  let searchTimer;
  document.querySelector("#vehicle-search").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(async () => { try { renderRows(container, await searchVehicles(context.workshopId, event.target.value), customerMap, context, refresh); } catch (error) { showToast(friendlyError(error), "error"); } }, 250); });
}
