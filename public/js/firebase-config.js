export async function loadFirebaseConfig() {
  try {
    const response = await fetch("/__/firebase/init.json", {cache: "no-store", credentials: "same-origin"});
    if (response.ok) {
      const config = await response.json();
      if (config?.projectId && config?.apiKey && config?.appId) return config;
    }
  } catch {
    // Local development falls through to the ignored local config file.
  }

  try {
    const local = await import("./config/firebase-config.local.js");
    if (local.firebaseConfig?.projectId && local.firebaseConfig?.apiKey && local.firebaseConfig?.appId) {
      return local.firebaseConfig;
    }
  } catch {
    // A clear setup error is thrown below.
  }
  throw new Error("Firebase ainda não foi configurado. Publique no Firebase Hosting ou crie public/js/config/firebase-config.local.js a partir do exemplo.");
}
