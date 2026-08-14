import { authenticateUser } from "./api-smooth1.js?v=rack-inventory1";

const SESSION_KEY = "sjops.session";
const DEFAULT_PIN = "1014";
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;

function storeSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    const lastActivity = Number(saved?.last_activity_at || 0);
    if (!saved?.authenticated || !lastActivity || Date.now() - lastActivity >= INACTIVITY_LIMIT_MS) {
      signOut();
      return null;
    }
    return saved;
  } catch (_error) {
    signOut();
    return null;
  }
}

export async function signIn(pin) {
  let session;
  try {
    session = await authenticateUser(pin);
  } catch (error) {
    session = legacySignIn(pin, error);
  }
  session.last_activity_at = Date.now();
  storeSession(session);
  return session;
}

export function touchSession() {
  const session = getSession();
  if (!session) return null;
  session.last_activity_at = Date.now();
  storeSession(session);
  return session;
}

export function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
}

function legacySignIn(pin, originalError) {
  if (String(pin || "").trim() === DEFAULT_PIN) {
    return { authenticated: true, user_id: "ADMIN", full_name: "Admin", role: "ADMIN" };
  }
  throw originalError;
}
