// Picks the active storage mode and exposes one async API to the rest of the app.
//   local  – "This PC only": everything in IndexedDB on this computer, fully offline
//   hybrid – "This PC + Google Sheets": offline-first, syncs to the sheet whenever online (recommended)
//   sheets – "Google Sheets live": every action goes straight to the sheet (needs internet)
import { createHybridAdapter } from "./hybrid-adapter.js";
import { createLocalAdapter } from "./local-adapter.js";
import { uid } from "./logic.js";
import { createSheetsAdapter } from "./sheets-adapter.js";

const KEY = "pos.backend.v1";
const DEVICE_KEY = "pos.device.v1";

export function getConfig() {
  let c = null;
  try {
    c = JSON.parse(localStorage.getItem(KEY));
  } catch {
    /* ignore */
  }
  c = { mode: "local", url: "", key: "", ...(c || {}) };
  if (c.mode === "demo") c.mode = "local";
  if (!["local", "hybrid", "sheets"].includes(c.mode) || (c.mode !== "local" && !c.url)) c.mode = "local";
  return c;
}

export function getDevice() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(DEVICE_KEY));
  } catch {
    /* ignore */
  }
  if (!d || !d.id || !d.code) {
    const alnum = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rnd = Array.from({ length: 2 }, () => alnum[Math.floor(Math.random() * alnum.length)]).join("");
    d = { id: uid(), code: `PC${rnd}`, ...(d || {}) };
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  }
  return d;
}

/** Counter code used in offline invoice numbers (e.g. INV-20250101-C1-0007). */
export function setDeviceCode(code) {
  const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (clean.length < 2) throw new Error("Use 2–6 letters or digits, e.g. C1");
  const d = { ...getDevice(), code: clean };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  resetAdapter();
  return d;
}

let adapterPromise = null;
let adapterNow = null;

function resetAdapter() {
  const old = adapterPromise;
  adapterPromise = null;
  adapterNow = null;
  if (old) old.then((a) => a.dispose && a.dispose()).catch(() => {});
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
  resetAdapter();
}

async function makeAdapter(cfg) {
  if (cfg.mode === "hybrid") return createHybridAdapter({ ...cfg, device: getDevice() });
  if (cfg.mode === "sheets") return createSheetsAdapter(cfg);
  return createLocalAdapter();
}

export function getAdapter() {
  if (!adapterPromise) {
    adapterPromise = makeAdapter(getConfig()).then(
      (a) => (adapterNow = a),
      (e) => {
        adapterPromise = null;
        throw e;
      },
    );
  }
  return adapterPromise;
}

/** Synchronous status of the active adapter (null until it's ready). */
export const currentStatus = () => (adapterNow && adapterNow.status ? adapterNow.status() : null);

const METHODS = [
  "bootstrap", "saveProduct", "deleteProduct", "adjustStock", "importProducts", "checkout", "voidSale",
  "getSale", "saveSettings", "ping", "sync", "exportData", "importData", "clearLog", "resetDemo", "startFresh",
  "importBulk", "uploadImage", "backupStatus", "backupSetup", "backupNow", "backupVerify", "backupRestore", "auditAppend",
];
export const backend = Object.fromEntries(
  METHODS.map((m) => [
    m,
    async (...args) => {
      const a = await getAdapter();
      return typeof a[m] === "function" ? a[m](...args) : null;
    },
  ]),
);
