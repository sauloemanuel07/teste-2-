import {getDashboard, listOrders} from "../data.js";
import {formatCurrency, formatDate, statusLabel, statusTone} from "../format.js";
import {emptyState} from "../ui.js";

function orderRow(order) {
  const row = document.createElement("tr");
  const link = document.createElement("a");
  link.href = `/ordem?id=${encodeURIComponent(order.id)}`;
  link.textContent = order.orderNumberDisplay || `OS-${order.orderNumber}`;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.dataset.tone = statusTone(order.status);
  badge.textContent = statusLabel(order.status);
  const values = [link, order.customerName || "Cliente", order.vehicleLabel || "Veículo", badge, formatDate(order.createdAt)];
  values.forEach((value) => {
    const cell = document.createElement("td");
    if (value instanceof Node) cell.append(value); else cell.textContent = value;
    row.append(cell);
  });
  return row;
}

export async function initDashboard(context) {
  const main = document.querySelector("#main-content");
  main.innerHTML = `<header class="page-header"><div><span class="eyebrow">Operação em tempo real</span><h1>Olá, <span id="dashboard-name"></span></h1><p id="dashboard-workshop"></p></div><a class="btn btn-primary" href="/nova-ordem">+ Nova ordem</a></header><section class="stats-grid" aria-label="Indicadores"><article class="card stat-card"><span class="stat-label">Ordens abertas</span><strong class="stat-value" id="stat-open">—</strong></article><article class="card stat-card"><span class="stat-label">Concluídas no mês</span><strong class="stat-value" id="stat-completed">—</strong></article><article class="card stat-card"><span class="stat-label" id="stat-revenue-label">Faturamento no mês</span><strong class="stat-value" id="stat-revenue">—</strong></article><article class="card stat-card"><span class="stat-label" id="stat-approval-label">Aprovação de orçamentos</span><strong class="stat-value" id="stat-approval">—</strong></article></section><section class="dashboard-grid"><article class="card"><div class="card-header"><div><h2 class="card-title">Ordens recentes</h2><p class="small muted">Últimas movimentações da oficina</p></div><a class="btn btn-secondary" href="/ordens">Ver todas</a></div><div id="recent-orders" class="table-wrap"></div></article><aside class="card"><div class="card-header"><h2 class="card-title">Próximos passos</h2></div><div class="card-body stack"><p class="small muted">Use o fluxo abaixo para manter o cliente informado.</p><ol class="stack small"><li><strong>1.</strong> Cadastre cliente e veículo</li><li><strong>2.</strong> Abra a ordem de serviço</li><li><strong>3.</strong> Registre diagnóstico e mídia</li><li><strong>4.</strong> Envie o orçamento e acompanhamento</li></ol></div></aside></section>`;
  document.querySelector("#dashboard-name").textContent = context.profile.name.split(" ")[0];
  document.querySelector("#dashboard-workshop").textContent = context.workshop?.name || "Sua oficina";
  if (!["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) main.querySelector(".page-header a[href='/nova-ordem']")?.remove();
  const canSeeFinancial = ["OWNER", "MANAGER", "FINANCIAL"].includes(context.membership.role);
  const data = canSeeFinancial ? await getDashboard(context.workshopId) : {summary: {}, monthly: {}, recentOrders: await listOrders(context.workshopId)};
  const approved = Number(data.monthly.estimatesApproved || 0);
  const rejected = Number(data.monthly.estimatesRejected || 0);
  const approvalRate = approved + rejected ? Math.round(approved / (approved + rejected) * 100) : 0;
  document.querySelector("#stat-open").textContent = Number(data.summary.openOrders || 0).toLocaleString("pt-BR");
  document.querySelector("#stat-completed").textContent = Number(data.monthly.ordersCompleted || 0).toLocaleString("pt-BR");
  if (canSeeFinancial) {
    document.querySelector("#stat-revenue").textContent = formatCurrency(data.monthly.revenueCents || 0);
    document.querySelector("#stat-approval").textContent = `${approvalRate}%`;
  } else {
    document.querySelector("#stat-revenue-label").textContent = "Em diagnóstico (últimas 50)";
    document.querySelector("#stat-approval-label").textContent = "Prontas para retirada";
    document.querySelector("#stat-open").textContent = data.recentOrders.filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status)).length.toLocaleString("pt-BR");
    document.querySelector("#stat-completed").textContent = data.recentOrders.filter((order) => order.status === "DELIVERED").length.toLocaleString("pt-BR");
    document.querySelector("#stat-revenue").textContent = data.recentOrders.filter((order) => ["DIAGNOSING", "DIAGNOSED"].includes(order.status)).length.toLocaleString("pt-BR");
    document.querySelector("#stat-approval").textContent = data.recentOrders.filter((order) => order.status === "READY").length.toLocaleString("pt-BR");
  }
  const recent = document.querySelector("#recent-orders");
  if (!data.recentOrders.length) {
    recent.append(emptyState({title: "Nenhuma ordem criada", description: "Crie a primeira ordem para iniciar o acompanhamento.", actionLabel: "Criar ordem", actionHref: "/nova-ordem"}));
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = "<thead><tr><th>OS</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Entrada</th></tr></thead>";
  const body = document.createElement("tbody");
  data.recentOrders.forEach((order) => body.append(orderRow(order)));
  table.append(body);
  recent.append(table);
}
