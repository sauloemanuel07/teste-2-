import {archiveCustomer, listCustomers, saveCustomer, searchCustomers} from "../data.js";
import {formatDate, formatPhone} from "../format.js";
import {confirmAction, emptyState, friendlyError, setButtonLoading, showToast} from "../ui.js";

function renderRows(container, customers, context, refresh) {
  container.replaceChildren();
  if (!customers.length) {
    container.append(emptyState({title: "Nenhum cliente encontrado", description: "Cadastre o primeiro cliente ou ajuste sua busca."}));
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = "<thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Cadastro</th><th>Ação</th></tr></thead>";
  const body = document.createElement("tbody");
  customers.forEach((customer) => {
    const row = document.createElement("tr");
    [customer.name, formatPhone(customer.phoneNormalized), customer.email || "—", formatDate(customer.createdAt)].forEach((text) => {
      const cell = document.createElement("td"); cell.textContent = text; row.append(cell);
    });
    const actionCell = document.createElement("td");
    const archive = document.createElement("button");
    archive.className = "btn btn-secondary";
    archive.type = "button";
    archive.textContent = "Arquivar";
    archive.addEventListener("click", async () => {
      if (!await confirmAction({title: "Arquivar cliente?", message: "O histórico será preservado e o cliente deixará de aparecer nas novas ordens.", confirmLabel: "Arquivar", danger: true})) return;
      try { await archiveCustomer(context, customer.id); showToast("Cliente arquivado.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); }
    });
    if (["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) actionCell.append(archive);
    else actionCell.textContent = "Somente leitura";
    row.append(actionCell); body.append(row);
  });
  table.append(body); container.append(table);
}

export async function initCustomers(context) {
  const main = document.querySelector("#main-content");
  main.innerHTML = `<header class="page-header"><div><span class="eyebrow">Relacionamento</span><h1>Clientes</h1><p>Dados reais, histórico preservado e busca indexada.</p></div></header><section class="two-column"><article class="card"><div class="card-header"><h2 class="card-title">Novo cliente</h2></div><form id="customer-form" class="card-body stack" novalidate><div class="field"><label for="customer-name">Nome</label><input id="customer-name" name="name" autocomplete="name" required maxlength="120"></div><div class="field"><label for="customer-phone">Telefone / WhatsApp</label><input id="customer-phone" name="phone" inputmode="tel" autocomplete="tel" required maxlength="24"></div><div class="field"><label for="customer-email">E-mail</label><input id="customer-email" name="email" type="email" autocomplete="email" maxlength="254"></div><div class="field"><label for="customer-document">CPF/CNPJ <span class="muted">(opcional)</span></label><input id="customer-document" name="document" maxlength="18"></div><div class="field"><label for="customer-notes">Observações</label><textarea id="customer-notes" name="notes" maxlength="2000"></textarea></div><button class="btn btn-primary btn-block" type="submit" data-loading-label="Salvando...">Cadastrar cliente</button></form></article><article class="card"><div class="card-header"><div><h2 class="card-title">Clientes ativos</h2><p class="small muted">Até 50 resultados por vez</p></div></div><div class="card-body"><div class="toolbar"><label class="field search-control"><span class="field-label">Buscar</span><input id="customer-search" type="search" placeholder="Nome ou telefone" maxlength="120"></label></div></div><div id="customers-table" class="table-wrap"></div></article></section>`;
  const container = document.querySelector("#customers-table");
  if (!["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) main.querySelector("#customer-form").closest("article").hidden = true;
  const refresh = async () => renderRows(container, await listCustomers(context.workshopId), context, refresh);
  await refresh();
  document.querySelector("#customer-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type='submit']"); setButtonLoading(button, true);
    try { await saveCustomer(context, Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); showToast("Cliente cadastrado com sucesso.", "success"); await refresh(); } catch (error) { showToast(friendlyError(error), "error"); } finally { setButtonLoading(button, false); }
  });
  let searchTimer;
  document.querySelector("#customer-search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try { renderRows(container, await searchCustomers(context.workshopId, event.target.value), context, refresh); } catch (error) { showToast(friendlyError(error), "error"); }
    }, 300);
  });
}
