// "This PC only" mode: the engine runs in the browser, data is stored in IndexedDB on this computer.
import * as engine from "./engine.js";
import { idb } from "./idb.js";
import { DEFAULT_SETTINGS } from "./logic.js";
import { buildDemoDb } from "./sample.js";

const KEY = "local.db";
const LEGACY_KEY = "pos.demo.db.v1"; // earlier versions kept demo data in localStorage

const valid = (db) => db && Array.isArray(db.products) && Array.isArray(db.sales) && Array.isArray(db.saleItems);
const changed = () => window.dispatchEvent(new CustomEvent("pos:local-change"));

/** Reads the local database without creating an adapter (used when offering to upload it to a sheet). */
export async function peekLocalDb() {
  const db = await idb.get(KEY).catch(() => null);
  return valid(db) ? db : null;
}

export async function createLocalAdapter() {
  let db = await idb.get(KEY);
  if (!valid(db)) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if (valid(legacy)) db = legacy;
    } catch {
      /* ignore */
    }
    if (!valid(db)) db = buildDemoDb();
    db.movements ||= [];
    await idb.set(KEY, db);
    localStorage.removeItem(LEGACY_KEY);
  }

  async function save() {
    try {
      await idb.set(KEY, db);
    } catch (e) {
      db = (await idb.get(KEY)) || db; // discard the unsaved change
      throw new Error("Couldn't save on this PC: " + (e.message || "storage error"));
    }
    changed();
  }

  // Engine functions validate before they mutate, so a thrown error leaves the data untouched.
  const run = (fn) => async (arg) => {
    const res = fn(db, arg || {});
    await save();
    return structuredClone(res);
  };

  return {
    kind: "local",
    ping: async () => ({ spreadsheetName: "This PC", spreadsheetUrl: "" }),
    bootstrap: async (opts) => structuredClone(engine.bootstrap(db, opts || {})),
    saveProduct: run(engine.saveProduct),
    deleteProduct: run(engine.deleteProduct),
    adjustStock: run((d, a) => engine.adjustStock(d, a)),
    importProducts: run(engine.importProducts),
    checkout: run((d, a) => engine.checkout(d, a)),
    voidSale: run((d, a) => engine.voidSale(d, a)),
    getSale: async (arg) => structuredClone(engine.getSale(db, arg || {})),
    saveSettings: run(engine.saveSettings),
    importBulk: run(engine.importBulk),
    // No cloud in this mode: the (already resized) photo is stored with the product on this PC.
    uploadImage: async ({ dataUrl }) => ({ url: dataUrl, local: true }),
    auditAppend: async ({ event }) => ({ local: true, event }),
    status: () => ({ mode: "local", online: navigator.onLine, pending: 0 }),
    exportData: async () => ({ app: "freshmart-pos", format: 1, mode: "local", exportedAt: new Date().toISOString(), local: db }),
    async importData(data) {
      if (!data || data.app !== "freshmart-pos" || data.mode !== "local" || !valid(data.local)) {
        throw new Error("This file isn't a “This PC only” backup of FreshMart POS");
      }
      db = { movements: [], settings: {}, ...data.local };
      await save();
      return { restored: db.sales.length };
    },
    async resetDemo() {
      db = buildDemoDb();
      await save();
    },
    async startFresh() {
      db = { ...engine.emptyDb(), settings: { ...DEFAULT_SETTINGS } };
      await save();
      return { fresh: true };
    },
  };
}
