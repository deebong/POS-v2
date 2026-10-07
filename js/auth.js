// Online staff authentication bridge. Local IndexedDB remains the offline authority when the POS is disconnected.
import { getConfig } from "./data/backend.js";
import { createSheetsAdapter } from "./data/sheets-adapter.js";
import { derivePinHash } from "./staff.js";

const TOKEN_KEY = "freshmart.auth.token";
const DEVICE_KEY = "freshmart.auth.device";

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(DEVICE_KEY, id); }
  return id;
}
function adapter() {
  const cfg = getConfig();
  if (!cfg.url) throw new Error("Google Sheets is not connected.");
  return createSheetsAdapter(cfg);
}
export function getAuthToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }
export function clearAuthToken() { sessionStorage.removeItem(TOKEN_KEY); }
export function hasOnlineAuth() { return !!getAuthToken(); }

export async function authStatus() {
  return adapter().authStatus();
}

export async function onlineLogin(username, pin, options = {}) {
  const api = adapter();
  const localHash = options.pinHash || "";
  const nonce = (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`) + `-${Math.random().toString(36).slice(2)}`;
  let pinHash = localHash;
  if (!pinHash) {
    const challenge = await api.authChallenge({ username });
    pinHash = await derivePinHash(pin, challenge.pinSalt, challenge.pinIterations);
  }
  const response = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pinHash}:${nonce}`));
  const hex = [...new Uint8Array(response)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const result = await api.authLogin({ username, nonce, response: hex, deviceId: deviceId() });
  sessionStorage.setItem(TOKEN_KEY, result.token);
  return result.staff;
}
export async function onlineLogout() {
  try { if (getAuthToken()) await adapter().authLogout(); } finally { clearAuthToken(); }
}

export async function syncStaffToServer(users, setupCode = "") {
  return adapter().authSyncStaff({ users, setupCode, deviceId: deviceId() });
}
