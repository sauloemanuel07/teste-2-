import {callBackend, listCustomers, listOrders, listVehicles} from "../data.js";
import {formatCurrency, formatDate, normalizeForSearch, statusLabel, statusTone} from "../format.js";
import {emptyState, friendlyError, setButtonLoading, showToast} from "../ui.js";
import {requiredText, validMileage} from "../validators.js";

function buildOrderRow(order) {
  const row = document.createElement("tr");
  const orderLink = document.createElement("a");
  orderLink.href = `/ordem?id=${encodeURIComponent(order.id)}`;
  orderLink.textContent = order.orderNumberDisplay || `OS-${String(order.orderNumber || "").padStart(6, "0")}`;
  const badge = document.createElement("span"); badge.className = "badge"; badge.dataset.tone = statusTone(order.status); badge.textContent = statusLabel(order.status);
  const fields = [orderLink, order.customerName || "Cliente", order.vehicleLabel || "Veículo", badge, formatCurrency(order.approvedTotalCents || order.estimatedTotalCents || 0), formatDate(order.createdAt)];
  fields.forEach((field) => { const cell = document.createElement("td"); if (field instanceof Node) cell.append(field); else cell.textContent = field; row.append(cell); });
  return row;
}

function renderOrders(container, orders) {
  container.replaceChildren();
  if (!orders.length) { container.append(emptyState({title: "Nenhuma ordem encontrada", description: "Crie a primeira ordem ou ajuste os filtros.", actionLabel: "Nova ordem", actionHref: "/nova-ordem"})); return; }
  const table = document.createElement("table"); table.className = "data-table";
  table.innerHTML = "<thead><tr><th>OS</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Total</th><th>Entrada</th></tr></thead>";
  const body = document.createElement("tbody"); orders.forEach((order) => body.append(buildOrderRow(order))); table.append(body); container.append(table);
}

export async function initOrders(context) {
  const main = document.querySelector("#main-content");
  main.innerHTML = `<header class="page-header"><div><span class="eyebrow">Acompanhamento completo</span><h1>Ordens de serviço</h1><p>Últimas 50 ordens, com status e valores reais.</p></div><a class="btn btn-primary" href="/nova-ordem">+ Nova ordem</a></header><section class="card"><div class="card-body toolbar"><label class="field search-control"><span class="field-label">Buscar</span><input id="order-search" type="search" placeholder="OS, cliente, veículo ou placa" maxlength="120"></label><label class="field"><span class="field-label">Status</span><select id="order-status"><option value="">Todos</option><option value="RECEIVED">Veículo recebido</option><option value="DIAGNOSING">Em diagnóstico</option><option value="DIAGNOSED">Diagnóstico concluído</option><option value="AWAITING_APPROVAL">Aguardando aprovação</option><option value="WAITING_PARTS">Aguardando peça</option><option value="IN_PROGRESS">Serviço em execução</option><option value="FINAL_TESTS">Testes finais</option><option value="READY">Veículo pronto</option><option value="DELIVERED">Entregue</option><option value="CANCELLED">Cancelado</option></select></label></div><div id="orders-table" class="table-wrap"></div></section>`;
  const orders = await listOrders(context.workshopId);
  if (!["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) main.querySelector(".page-header a[href='/nova-ordem']")?.remove();
  const container = document.querySelector("#orders-table");
  const applyFilters = () => {
    const term = normalizeForSearch(document.querySelector("#order-search").value);
    const status = document.querySelector("#order-status").value;
    const filtered = orders.filter((order) => (!status || order.status === status) && (!term || normalizeForSearch(`${order.orderNumberDisplay} ${order.customerName} ${order.vehicleLabel} ${order.vehiclePlate}`).includes(term)));
    renderOrders(container, filtered);
  };
  document.querySelector("#order-search").addEventListener("input", applyFilters);
  document.querySelector("#order-status").addEventListener("change", applyFilters);
  applyFilters();
}

function populateOptions(select, items, placeholder, label) {
  select.replaceChildren(new Option(placeholder, ""));
  items.forEach((item) => select.add(new Option(label(item), item.id)));
}

export async function initNewOrder(context) {
  if (!["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) throw new Error("Você não possui permissão para abrir uma ordem de serviço.");
  const main = document.querySelector("#main-content");
  main.innerHTML = `<header class="page-header"><div><span class="eyebrow">Fluxo rápido</span><h1>Nova ordem de serviço</h1><p>Selecione cliente e veículo, registre a entrada e comece a timeline.</p></div><a class="btn btn-secondary" href="/ordens">Cancelar</a></header><section class="card"><div class="card-header"><div><h2 class="card-title">Dados de entrada</h2><p class="small muted">A OS será numerada e registrada atomicamente no backend.</p></div></div><form id="new-order-form" class="card-body form-grid" novalidate><div class="field"><label for="order-customer">Cliente</label><select id="order-customer" name="customerId" required></select></div><div class="field"><label for="order-vehicle">Veículo</label><select id="order-vehicle" name="vehicleId" required></select></div><div class="field"><label for="order-mileage">Quilometragem de entrada</label><input id="order-mileage" name="initialMileage" type="number" min="0" max="5000000" required></div><div class="field"><label for="order-completion">Previsão de conclusão <span class="muted">(opcional)</span></label><input id="order-completion" name="estimatedCompletion" type="datetime-local"></div><div class="field form-span-2"><label for="order-complaint">Relato do cliente</label><textarea id="order-complaint" name="customerComplaint" required minlength="3" maxlength="2000" placeholder="Descreva o motivo da visita com as palavras do cliente."></textarea></div><button class="btn btn-primary form-span-2" type="submit" data-loading-label="Criando ordem...">Criar ordem de serviço</button></form></section>`;
  const [customers, vehicles] = await Promise.all([listCustomers(context.workshopId, 100), listVehicles(context.workshopId, 100)]);
  if (!customers.length || !vehicles.length) {
    const warning = document.createElement("p"); warning.className = "alert"; warning.textContent = "Cadastre ao menos um cliente e um veículo antes de criar a ordem."; main.prepend(warning);
  }
  const customerSelect = document.querySelector("#order-customer");
  const vehicleSelect = document.querySelector("#order-vehicle");
  populateOptions(customerSelect, customers, "Selecione o cliente", (item) => item.name);
  const updateVehicleOptions = () => {
    const related = vehicles.filter((vehicle) => !customerSelect.value || vehicle.ownerId === customerSelect.value);
    populateOptions(vehicleSelect, related, "Selecione o veículo", (item) => `${item.brand} ${item.model} · ${item.plate}`);
    const first = related[0];
    if (related.length === 1) { vehicleSelect.value = first.id; document.querySelector("#order-mileage").value = first.mileage || 0; }
  };
  customerSelect.addEventListener("change", updateVehicleOptions);
  vehicleSelect.addEventListener("change", () => { const selected = vehicles.find((vehicle) => vehicle.id === vehicleSelect.value); if (selected) document.querySelector("#order-mileage").value = selected.mileage || 0; });
  updateVehicleOptions();
  document.querySelector("#new-order-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']"); setButtonLoading(button, true);
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const result = await callBackend("createWorkOrder", {
        workshopId: context.workshopId,
        customerId: requiredText(data.customerId, "Cliente", {min: 10, max: 80}),
        vehicleId: requiredText(data.vehicleId, "Veículo", {min: 10, max: 80}),
        initialMileage: validMileage(data.initialMileage),
        customerComplaint: requiredText(data.customerComplaint, "Relato do cliente", {min: 3, max: 2000}),
        estimatedCompletion: data.estimatedCompletion ? new Date(data.estimatedCompletion).valueOf() : null,
        assignedTo: ""
      });
      showToast(`${result.orderNumberDisplay} criada com sucesso.`, "success");
      location.assign(`/ordem?id=${encodeURIComponent(result.orderId)}`);
    } catch (error) { showToast(friendlyError(error), "error"); setButtonLoading(button, false); }
  });
}
