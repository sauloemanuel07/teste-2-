import {initials} from "./format.js";

const PAGE_TITLES = Object.freeze({
  dashboard: "Visão geral",
  customers: "Clientes",
  vehicles: "Veículos",
  orders: "Ordens de serviço",
  "new-order": "Nova ordem",
  "order-detail": "Detalhes da ordem"
});

const NAV_ITEMS = [
  {page: "dashboard", href: "/dashboard", label: "Visão geral", icon: "01"},
  {page: "customers", href: "/clientes", label: "Clientes", icon: "02"},
  {page: "vehicles", href: "/veiculos", label: "Veículos", icon: "03"},
  {page: "orders", href: "/ordens", label: "Ordens", icon: "04"}
];

export function renderAppShell(page) {
  const root = document.querySelector("#app-shell");
  const title = PAGE_TITLES[page] || "Oficlaro";
  const nav = NAV_ITEMS.map((item) => `<li><a class="nav-link" href="${item.href}" ${item.page === page || (page === "order-detail" && item.page === "orders") || (page === "new-order" && item.page === "orders") ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${item.icon}</span>${item.label}</a></li>`).join("");
  root.className = "app-shell";
  root.innerHTML = `<aside class="sidebar" id="sidebar"><a class="brand" href="/dashboard"><span class="brand-mark" aria-hidden="true">OC</span>Oficlaro</a><nav aria-label="Navegação principal"><ul class="nav-list">${nav}</ul></nav><div class="sidebar-footer"><div class="user-chip"><span class="avatar" id="user-avatar">OF</span><span><strong id="user-name">Carregando...</strong><span id="user-role">—</span></span></div><button class="btn btn-secondary btn-block" id="logout-button" type="button">Sair</button></div></aside><section class="app-main"><header class="topbar"><div class="cluster"><button class="icon-btn mobile-menu" id="menu-button" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="Abrir menu">☰</button><p class="breadcrumbs">Oficlaro / <strong>${title}</strong></p></div><a class="btn btn-primary" href="/nova-ordem">+ Nova ordem</a></header><main id="main-content" class="page" tabindex="-1"></main></section>`;
  const menu = root.querySelector("#menu-button");
  menu?.addEventListener("click", () => {
    const open = document.body.dataset.menuOpen !== "true";
    document.body.dataset.menuOpen = String(open);
    menu.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.dataset.menuOpen === "true") {
      document.body.dataset.menuOpen = "false";
      menu?.setAttribute("aria-expanded", "false");
    }
  });
}

export function setSessionIdentity(context) {
  const name = context.profile?.name || context.user?.displayName || context.user?.email || "Usuário";
  document.querySelector("#user-name").textContent = name;
  document.querySelector("#user-role").textContent = context.membership?.role || "Membro";
  document.querySelector("#user-avatar").textContent = initials(name);
}

export function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = button.dataset.loadingLabel || "Processando...";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

export function showMessage(element, message, tone = "error") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = false;
}

export function clearMessage(element) {
  if (!element) return;
  element.hidden = true;
  element.textContent = "";
}

export function showToast(message, tone = "info") {
  const region = document.querySelector("#toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.tone = tone;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 5000);
}

export function emptyState({title, description, actionLabel, actionHref}) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const content = document.createElement("div");
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "+";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.className = "muted";
  paragraph.textContent = description;
  content.append(icon, heading, paragraph);
  if (actionLabel && actionHref) {
    const action = document.createElement("a");
    action.className = "btn btn-primary";
    action.href = actionHref;
    action.textContent = actionLabel;
    content.append(action);
  }
  wrapper.append(content);
  return wrapper;
}

export async function confirmAction({title, message, confirmLabel = "Confirmar", danger = false}) {
  const dialog = document.createElement("dialog");
  const body = document.createElement("div"); body.className = "dialog-body stack";
  const heading = document.createElement("h2"); heading.textContent = title;
  const paragraph = document.createElement("p"); paragraph.className = "muted"; paragraph.textContent = message;
  body.append(heading, paragraph);
  const actions = document.createElement("div"); actions.className = "dialog-actions";
  const cancel = document.createElement("button"); cancel.className = "btn btn-secondary"; cancel.value = "cancel"; cancel.textContent = "Cancelar";
  const confirm = document.createElement("button"); confirm.className = `btn ${danger ? "btn-danger" : "btn-primary"}`; confirm.value = "confirm"; confirm.textContent = confirmLabel;
  actions.append(cancel, confirm); dialog.append(body, actions);
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => { const result = dialog.returnValue === "confirm"; dialog.remove(); resolve(result); }, {once: true});
    dialog.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => dialog.close(button.value)));
    dialog.showModal();
  });
}

export function friendlyError(error) {
  const code = error?.code || "";
  const known = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 8 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "appCheck/recaptcha-error": "Não foi possível validar a segurança desta sessão. Recarregue a página.",
    "appCheck/fetch-status-error": "A validação de segurança está indisponível. Tente novamente em instantes.",
    "appCheck/throttled": "Muitas tentativas de validação. Aguarde alguns minutos.",
    "functions/unauthenticated": "Sua sessão expirou. Entre novamente.",
    "functions/permission-denied": "Você não possui permissão para esta ação.",
    "PERMISSION_DENIED": "Você não possui permissão para acessar estes dados."
  };
  return known[code] || error?.message || "Não foi possível concluir a operação. Tente novamente.";
}
