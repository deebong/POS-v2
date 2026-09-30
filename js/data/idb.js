// Minimal IndexedDB key-value store. IndexedDB lives on the PC's disk (inside the browser/app profile),
// holds far more than localStorage and survives restarts, so the POS keeps working without internet.
const DB_NAME = "freshmart-pos";
const STORE = "kv";
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("This browser doesn't support offline storage"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error("Couldn't open offline storage"));
      req.onblocked = () => reject(new Error("Offline storage is blocked by another window of this app"));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        const req = fn(store);
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = t.onabort = () => reject(t.error || new Error("Offline storage error"));
      }),
  );
}

export const idb = {
  get: (key) => tx("readonly", (s) => s.get(key)),
  set: (key, value) => tx("readwrite", (s) => s.put(value, key)),
  del: (key) => tx("readwrite", (s) => s.delete(key)),
  /** Writes several keys in ONE transaction (all-or-nothing). */
  setMany: (entries) =>
    tx("readwrite", (s) => {
      for (const [k, v] of entries) s.put(v, k);
    }),
};
