import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {get, ref} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import {httpsCallable} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-functions.js";
import {firebaseReady} from "./firebase.js";

export async function waitForAuth() {
  const {auth} = await firebaseReady;
  await setPersistence(auth, browserLocalPersistence);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => { unsubscribe(); resolve(user); });
  });
}

export async function registerAccount({name, email, password}) {
  const {auth} = await firebaseReady;
  await setPersistence(auth, browserLocalPersistence);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, {displayName: name});
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function loginAccount({email, password}) {
  const {auth} = await firebaseReady;
  await setPersistence(auth, browserLocalPersistence);
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function resetPassword(email) {
  const {auth} = await firebaseReady;
  await sendPasswordResetEmail(auth, email);
}

export async function logout() {
  const {auth} = await firebaseReady;
  await signOut(auth);
}

export async function completeOnboarding(payload) {
  const {auth, functions} = await firebaseReady;
  const result = await httpsCallable(functions, "completeOnboarding")(payload);
  await auth.currentUser?.getIdToken(true);
  return result.data;
}

export async function getSessionContext() {
  const {database} = await firebaseReady;
  const user = await waitForAuth();
  if (!user) return null;
  const profile = (await get(ref(database, `users/${user.uid}`))).val();
  if (!profile?.currentWorkshopId) return {user, profile: null, membership: null, workshop: null};
  const workshopId = profile.currentWorkshopId;
  const [membershipSnap, workshopSnap] = await Promise.all([
    get(ref(database, `workshopUsers/${workshopId}/${user.uid}`)),
    get(ref(database, `workshops/${workshopId}`))
  ]);
  const membership = membershipSnap.val();
  if (!membership?.active) throw new Error("Seu acesso a esta oficina está inativo.");
  return {user, profile, membership, workshop: workshopSnap.val(), workshopId};
}
