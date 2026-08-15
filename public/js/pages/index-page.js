import {getSessionContext} from "../auth-service.js";
import {friendlyError, showMessage} from "../ui.js";

try {
  const context = await getSessionContext();
  if (!context) location.replace("/login");
  else if (!context.profile?.currentWorkshopId) location.replace("/onboarding");
  else location.replace("/dashboard");
} catch (error) {
  showMessage(document.querySelector("#bootstrap-error"), friendlyError(error));
}

