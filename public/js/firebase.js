import {getApp, getApps, initializeApp} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {initializeAppCheck, ReCaptchaEnterpriseProvider} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app-check.js";
import {connectAuthEmulator, getAuth} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {connectDatabaseEmulator, getDatabase} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import {connectFunctionsEmulator, getFunctions} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-functions.js";
import {connectStorageEmulator, getStorage} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import {runtimeConfig} from "./config/runtime-config.js";
import {loadFirebaseConfig} from "./firebase-config.js";

async function initializeFirebase() {
  const config = await loadFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp(config);
  if (runtimeConfig.appCheckSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(runtimeConfig.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  }
  const auth = getAuth(app);
  const database = getDatabase(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, runtimeConfig.functionsRegion);
  if (runtimeConfig.useEmulators && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    connectAuthEmulator(auth, `http://${runtimeConfig.emulatorHost}:9099`, {disableWarnings: true});
    connectDatabaseEmulator(database, runtimeConfig.emulatorHost, 9000);
    connectStorageEmulator(storage, runtimeConfig.emulatorHost, 9199);
    connectFunctionsEmulator(functions, runtimeConfig.emulatorHost, 5001);
  }
  return {app, auth, database, storage, functions, config};
}

export const firebaseReady = initializeFirebase();
