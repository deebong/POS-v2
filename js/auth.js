// Online staff authentication bridge. Local IndexedDB remains the offline authority when the POS is disconnected.
import { getConfig } from "./data/backend.js";
import { createSheetsAdapter } from "./data/sheets-adapter.js";
import { derivePinHash } from "./staff.js";

const TOKEN_KEY = "freshmart.auth.token";
const DEVICE_KEY = "freshmart.auth.device";
const challengeCache = new Map();

export function prefetchAuthChallenge(username) {
  const key = String(username || "").trim().toLowerCase();
  if (!key) return Promise.reject(new Error("Username is required."));
  const cached = challengeCache.get(key);
  if (cached && Date.now() - cached.startedAt < 120000) return cached.promise;
  if (cached) challengeCache.delete(key);
  const entry = { startedAt: Date.now(), promise: null };
  entry.promise = adapter().authChallenge({ username: key }).catch((error) => {
    if (challengeCache.get(key) === entry) challengeCache.delete(key);
    throw error;
  });
  challengeCache.set(key, entry);
  return entry.promise;
}

async function challengeForLogin(username) {
  const key = String(username || "").trim().toLowerCase();
  const cached = challengeCache.get(key);
  if (cached && Date.now() - cached.startedAt < 120000) {
    try {
      const challenge = await cached.promise;
      if (challengeCache.get(key) === cached) challengeCache.delete(key);
      return challenge;
    } catch (error) {
      if (challengeCache.get(key) === cached) challengeCache.delete(key);
      throw error;
    }
  }
  if (cached) challengeCache.delete(key);
  return prefetchAuthChallenge(key);
}

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
export function getAuthToken() { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ""; }
export function clearAuthToken() { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }
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
    const challenge = await challengeForLogin(username);
    pinHash = await derivePinHash(pin, challenge.pinSalt, challenge.pinIterations);
  }
  const response = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pinHash}:${nonce}`));
  const hex = [...new Uint8Array(response)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const result = await api.authLogin({ username, nonce, response: hex, deviceId: deviceId() });
  localStorage.setItem(TOKEN_KEY, result.token);
  sessionStorage.removeItem(TOKEN_KEY);
  return result.staff;
}
export async function onlineLogout() {
  const token = getAuthToken();
  // Remove the credential from this browser immediately; the server revocation
  // request carries the captured token and must not block local logout.
  clearAuthToken();
  if (!token) return;
  await adapter().authLogout({ authToken: token });
}

export async function syncStaffToServer(users, setupCode = "") {
  return adapter().authSyncStaff({ users, setupCode, deviceId: deviceId() });
}
