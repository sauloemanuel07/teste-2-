import {getSessionContext, completeOnboarding, loginAccount, registerAccount, resetPassword, waitForAuth} from "../auth-service.js";
import {clearMessage, friendlyError, setButtonLoading, showMessage, showToast} from "../ui.js";
import {requiredText, validEmail, validPhone} from "../validators.js";

const page = document.body.dataset.page;
const message = document.querySelector("#auth-message");

async function routeAuthenticatedUser() {
  const context = await getSessionContext();
  if (!context) return false;
  location.replace(context.profile?.currentWorkshopId ? "/dashboard" : "/onboarding");
  return true;
}

if (page === "login") {
  const current = await waitForAuth().catch(() => null);
  if (current) await routeAuthenticatedUser();
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(message);
    const button = event.currentTarget.querySelector("button[type='submit']");
    setButtonLoading(button, true);
    try {
      const data = new FormData(event.currentTarget);
      const email = validEmail(data.get("email"));
      if (!email) throw new Error("Informe seu e-mail.");
      await loginAccount({email, password: String(data.get("password") || "")});
      await routeAuthenticatedUser();
    } catch (error) {
      showMessage(message, friendlyError(error));
      setButtonLoading(button, false);
    }
  });
  document.querySelector("#reset-password")?.addEventListener("click", async (event) => {
    event.preventDefault();
    clearMessage(message);
    try {
      const email = validEmail(document.querySelector("#email").value);
      if (!email) throw new Error("Informe seu e-mail para receber a recuperação de senha.");
      await resetPassword(email);
      showMessage(message, "Enviamos as instruções de recuperação para o seu e-mail.", "success");
    } catch (error) {
      showMessage(message, friendlyError(error));
    }
  });
}

if (page === "signup") {
  const current = await waitForAuth().catch(() => null);
  if (current) await routeAuthenticatedUser();
  document.querySelector("#signup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(message);
    const button = event.currentTarget.querySelector("button[type='submit']");
    setButtonLoading(button, true);
    try {
      const data = new FormData(event.currentTarget);
      const name = requiredText(data.get("name"), "Nome", {max: 120});
      const email = validEmail(data.get("email"));
      if (!email) throw new Error("Informe seu e-mail.");
      const password = String(data.get("password") || "");
      if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
      if (password !== data.get("passwordConfirm")) throw new Error("As senhas não coincidem.");
      await registerAccount({name, email, password});
      location.replace("/onboarding");
    } catch (error) {
      showMessage(message, friendlyError(error));
      setButtonLoading(button, false);
    }
  });
}

if (page === "onboarding") {
  const user = await waitForAuth().catch(() => null);
  if (!user) location.replace("/login");
  document.querySelector("#owner-name").value = user?.displayName || "";
  document.querySelector("#onboarding-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(message);
    const button = event.currentTarget.querySelector("button[type='submit']");
    setButtonLoading(button, true);
    try {
      const data = new FormData(event.currentTarget);
      await completeOnboarding({
        name: requiredText(data.get("name"), "Nome", {max: 120}),
        workshopName: requiredText(data.get("workshopName"), "Nome da oficina", {max: 120}),
        phone: validPhone(data.get("phone")),
        document: String(data.get("document") || "").trim()
      });
      showToast("Oficina criada com sucesso.", "success");
      location.replace("/dashboard");
    } catch (error) {
      showMessage(message, friendlyError(error));
      setButtonLoading(button, false);
    }
  });
}
