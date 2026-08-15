import {getSessionContext, logout} from "../auth-service.js";
import {friendlyError, renderAppShell, setSessionIdentity, showToast} from "../ui.js";
import {initDashboard} from "./dashboard-page.js";
import {initCustomers} from "./customers-page.js";
import {initVehicles} from "./vehicles-page.js";
import {initOrders, initNewOrder} from "./orders-page.js";
import {initOrderDetail} from "./order-detail-page.js";

const page = document.body.dataset.page;
renderAppShell(page);

try {
  const context = await getSessionContext();
  if (!context) location.replace("/login");
  else if (!context.profile?.currentWorkshopId) location.replace("/onboarding");
  else {
    setSessionIdentity(context);
    if (!["OWNER", "MANAGER", "ATTENDANT"].includes(context.membership.role)) {
      document.querySelector(".topbar a[href='/nova-ordem']")?.remove();
    }
    document.querySelector("#logout-button")?.addEventListener("click", async () => {
      try {
        await logout();
        location.replace("/login");
      } catch (error) {
        showToast(friendlyError(error), "error");
      }
    });
    const controllers = {
      dashboard: initDashboard,
      customers: initCustomers,
      vehicles: initVehicles,
      orders: initOrders,
      "new-order": initNewOrder,
      "order-detail": initOrderDetail
    };
    await controllers[page]?.(context);
  }
} catch (error) {
  const main = document.querySelector("#main-content");
  main.replaceChildren();
  const alert = document.createElement("p");
  alert.className = "alert";
  alert.dataset.tone = "error";
  alert.setAttribute("role", "alert");
  alert.textContent = friendlyError(error);
  main.append(alert);
}
