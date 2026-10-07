// "This PC + Google Sheets" (offline-first) mode.
//
//   snapshot  – the last full download from the sheet (IndexedDB)
//   applied   – operations the sheet has confirmed but that aren't in the snapshot yet (until the next download)
//   outbox    – operations made on this PC that haven't reached the sheet yet
//   view      – what the POS shows = snapshot + applied + outbox (rebuilt by replaying the operations)
//
// Every change is applied to the view instantly and queued with a unique opId. When online, queued
// operations are pushed in order (the Apps Script de-duplicates by opId, so retries are safe), then a
// fresh snapshot is downloaded. Sales made offline get device-scoped invoice numbers (INV-date-PC1-0001)
// so two counters can never clash, and the printed receipt number stays valid after syncing.
import * as engine from "./engine.js";
import { idb } from "./idb.js";
import { DEFAULT_SETTINGS, uid } from "./logic.js";
import { createSheetsAdapter } from "./sheets-adapter.js";

const K = { snapshot: "hybrid.snapshot", outbox: "hybrid.outbox", applied: "hybrid.applied", meta: "hybrid.meta", log: "hybrid.log" };
const BATCH = 20;
const HISTORY_DAYS = 90;
const pad = (n, w = 2) => String(n).padStart(w, "0");
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

function describe(op) {
  const p = op.payload || {};
  switch (op.type) {
    case "sale": return `Sale ${p.sale?.invoiceNo || ""}`;
    case "void": return `Void ${p.invoiceNo || ""}`;
    case "product.save": return `${p.isCreate ? "New product" : "Edit"} ${p.product?.name || p.matchSku || ""}`;
    case "product.delete": return `Delete product ${p.sku || ""}`;
    case "stock": return `Stock ${p.mode} ${p.quantity} · ${p.sku || ""}`;
    case "import": return `Import ${(p.products || []).length} products`;
    case "settings": return "Store settings";
    case "customer.save": return `${p.customer?.id ? "Edit" : "New"} customer ${p.customer?.name || ""}`;
    case "audit": return `Security audit ${p.event?.action || ""}`;
    default: return op.type;
  }
}

export async function createHybridAdapter(cfg) {
  const remote = createSheetsAdapter(cfg);
  const device = cfg.device;
  let [snapshot, outbox, applied, meta, log] = await Promise.all(Object.values(K).map((k) => idb.get(k)));
  outbox = Array.isArray(outbox) ? outbox : [];
  applied = Array.isArray(applied) ? applied : [];
  log = Array.isArray(log) ? log : [];
  meta = { tempSeq: 0, invSeq: 0, lastSyncAt: null, lastPullAt: null, ...(meta || {}) };
  // A different sheet was connected and nothing is waiting to be sent: start from a clean download.
  if (snapshot && snapshot.url !== cfg.url && !outbox.length && !applied.length) snapshot = null;

  const status = { syncing: false, lastError: null, authRequired: false };
  let running = null;
  let again = null;
  let pushTimer = null;
  let retryTimer = null;
  let retryDelayMs = 10000;
  let disposed = false;

  const newTempId = () => {
    meta.tempSeq += 1;
    return -meta.tempSeq;
  };

  function rebuild() {
    const s = snapshot || {};
    const db = {
      products: structuredClone(s.products || []),
      customers: structuredClone(s.customers || []),
      sales: structuredClone(s.sales || []).map((x) => ({ clientRef: null, ...x })),
      saleItems: structuredClone(s.saleItems || []),
      movements: [],
      settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    };
    Object.defineProperty(db, "$newId", { value: newTempId, enumerable: false });
    for (const op of [...applied, ...outbox]) {
      try {
        engine.replayOp(db, op);
      } catch (e) {
        console.warn("Could not replay", op.type, e);
      }
    }
    return db;
  }
  let view = rebuild();

  const data = { get outbox() { return outbox; }, get applied() { return applied; }, get meta() { return meta; }, get log() { return log; }, get snapshot() { return snapshot; } };
  const persist = (keys) => idb.setMany(keys.map((k) => [K[k], data[k]]));
  const emit = () => window.dispatchEvent(new CustomEvent("sync:status"));
  const notify = (res) => {
    window.dispatchEvent(new CustomEvent("pos:synced", { detail: res || {} }));
    window.dispatchEvent(new CustomEvent("pos:local-change"));
  };

  function devInvoice(now) {
    meta.invSeq += 1;
    return `INV-${ymd(now)}-${device.code}-${pad(meta.invSeq, 4)}`;
  }
  function bumpInvoiceSeq() {
    const re = new RegExp(`^INV-\\d{8}-${device.code}-(\\d+)$`);
    for (const s of snapshot?.sales || []) {
      const m = re.exec(s.invoiceNo);
      if (m) meta.invSeq = Math.max(meta.invSeq, Number(m[1]));
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sync({ pull: false }).then(notify), 1200);
  }

  function scheduleRetry() {
    if (disposed || !navigator.onLine || retryTimer || status.authRequired) return;
    const delay = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 2, 5 * 60 * 1000);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      sync({ pull: false }).then(notify);
    }, delay);
  }

  /** Applies a change locally, queues it, and saves the queue to disk before reporting success. */
  async function mutate(fn, makeOp) {
    const res = fn(view); // throws on validation errors, before anything changes
    const op = { opId: uid(), at: new Date().toISOString(), deviceId: device.id, ...makeOp(res) };
    outbox.push(op);
    try {
      await persist(["outbox", "meta"]);
    } catch (e) {
      outbox = outbox.filter((o) => o !== op);
      view = rebuild();
      throw new Error("Couldn't save on this PC: " + (e.message || "storage error"));
    }
    emit();
    window.dispatchEvent(new CustomEvent("pos:local-change"));
    schedulePush();
    return structuredClone(res);
  }

  async function sync({ pull = true, throwOnError = false } = {}) {
    if (disposed) return {};
    if (running) {
      again = { pull: pull || Boolean(again && again.pull) };
      return running;
    }
    running = (async () => {
      if (!navigator.onLine) {
        emit();
        if (throwOnError) throw new Error("You're offline");
        return { offline: true };
      }
      status.syncing = true;
      emit();
      let changed = false;
      try {
        while (outbox.length && !disposed) {
          const batch = outbox.slice(0, BATCH);
          const res = await remote.syncBatch({ ops: batch, deviceId: device.id, deviceCode: device.code });
          const results = new Map((res.results || []).map((r) => [r.opId, r]));
          if (!results.size) throw new Error("The sheet didn't confirm any changes");
          for (const op of batch) {
            const r = results.get(op.opId);
            if (!r) continue;
            if (r.ok) applied.push(op);
            else changed = true; // a rejected change must disappear from the view
            if (!r.ok || r.warning) {
              log.unshift({ level: r.ok ? "warning" : "error", at: new Date().toISOString(), summary: describe(op), message: r.error || r.warning });
            }
          }
          outbox = outbox.filter((o) => !results.has(o.opId));
          log = log.slice(0, 50);
          await persist(["outbox", "applied", "log"]);
          emit();
        }
        if (pull && !disposed) {
          const d = await remote.bootstrap({ days: HISTORY_DAYS, includeOps: true });
          const incomingProducts = Array.isArray(d.products) ? d.products : [];
          const incomingSales = Array.isArray(d.sales) ? d.sales : [];
          // Never replace a populated local snapshot with an unexpectedly empty remote payload.
          // A transient/partial Apps Script response must not make a working counter appear empty.
          const hadData = Boolean((snapshot?.products || []).length || (snapshot?.sales || []).length);
          if (hadData && !incomingProducts.length && !incomingSales.length) {
            throw new Error("Google Sheets returned an empty dataset. Your saved counter data was kept; sync was not applied.");
          }
          snapshot = {
            products: incomingProducts,
            customers: Array.isArray(d.customers) ? d.customers : [],
            sales: incomingSales,
            saleItems: Array.isArray(d.saleItems) ? d.saleItems : [],
            settings: d.settings || {},
            spreadsheetUrl: d.spreadsheetUrl || "",
            spreadsheetName: d.spreadsheetName || "",
            version: d.version || "",
            url: cfg.url,
            pulledAt: new Date().toISOString(),
          };
          const acked = new Set(d.appliedOps || []);
          outbox = outbox.filter((o) => !acked.has(o.opId)); // the sheet already has these (reply was lost)
          applied = [];
          bumpInvoiceSeq();
          meta.lastPullAt = snapshot.pulledAt;
          changed = true;
        }
        if (changed) view = rebuild();
        meta.lastSyncAt = new Date().toISOString();
        status.lastError = null;
        status.authRequired = false;
        retryDelayMs = 10000;
        clearTimeout(retryTimer);
        retryTimer = null;
        await persist(pull ? ["snapshot", "outbox", "applied", "meta"] : ["meta"]);
        const current = engine.bootstrap(view, { days: HISTORY_DAYS });
        return { changed, data: current };
      } catch (e) {
        status.lastError = e.message || "Sync failed";
        status.authRequired = /Authentication required or session expired|Invalid access key/i.test(status.lastError);
        if (status.authRequired) {
          try { sessionStorage.removeItem("freshmart.auth.token"); } catch {}
        }
        if (throwOnError) throw e;
        scheduleRetry();
        return { error: status.lastError, authRequired: status.authRequired };
      } finally {
        status.syncing = false;
        emit();
      }
    })();
    try {
      return await running;
    } finally {
      running = null;
      if (again && !disposed) {
        const next = again;
        again = null;
        sync(next).then(notify);
      }
    }
  }

  const onOnline = () => {
    retryDelayMs = 10000;
    clearTimeout(retryTimer);
    retryTimer = null;
    sync({ pull: true }).then(notify);
  };
  const onOffline = () => emit();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  if (outbox.length) schedulePush();

  return {
    kind: "hybrid",
    ping: () => remote.ping(),
    installationStatus: () => remote.installationStatus(),
    initialize: (arg) => remote.initialize(arg),
    async bootstrap(opts) {
      if (!snapshot) {
        if (!navigator.onLine) {
          throw new Error("You're offline. Connect to the internet once so this PC can download your data from Google Sheets.");
        }
        await sync({ pull: true, throwOnError: true });
      }
      return {
        ...structuredClone(engine.bootstrap(view, opts || {})),
        spreadsheetUrl: snapshot?.spreadsheetUrl || "",
        spreadsheetName: snapshot?.spreadsheetName || "",
        version: snapshot?.version || "",
      };
    },
    /** Bulk imports go straight to the sheet (they can be large), then the PC downloads the result. */
    async importBulk(payload) {
      if (!navigator.onLine) throw new Error("Importing into Google Sheets needs internet. Connect and try again.");
      const res = await remote.importBulk(payload);
      await sync({ pull: true, throwOnError: true });
      window.dispatchEvent(new CustomEvent("pos:local-change"));
      return res;
    },
    async uploadImage(arg) {
      if (!navigator.onLine) throw new Error("You're offline");
      return remote.uploadImage(arg);
    },
    saveProduct({ product }) {
      const before = product && product.id ? view.products.find((p) => p.id === Number(product.id)) : null;
      const matchSku = before ? before.sku : null;
      return mutate(
        (db) => engine.saveProduct(db, { product }),
        (res) => ({ type: "product.save", payload: { id: res.product.id, matchSku: matchSku || res.product.sku, isCreate: !before, product: { ...res.product } } }),
      );
    },
    deleteProduct({ id }) {
      const sku = view.products.find((x) => x.id === Number(id))?.sku;
      return mutate((db) => engine.deleteProduct(db, { id }), () => ({ type: "product.delete", payload: { id: Number(id), sku } }));
    },
    adjustStock(a) {
      return mutate(
        (db) => engine.adjustStock(db, a),
        (res) => ({ type: "stock", payload: { id: res.product.id, sku: res.product.sku, mode: a.mode, quantity: Number(a.quantity), reason: a.reason || "" } }),
      );
    },
    importProducts(a) {
      return mutate((db) => engine.importProducts(db, a), (res) => ({ type: "import", payload: { products: res.products.map((p) => ({ ...p })) } }));
    },
    async checkout(body) {
      if (body.clientRef && view.sales.some((s) => s.clientRef === body.clientRef)) {
        return structuredClone(engine.checkout(view, body)); // retry of a bill already recorded here
      }
      return mutate(
        (db) => engine.checkout(db, body, { invoiceNo: devInvoice }),
        (res) => {
          const full = view.sales.find((s) => s.id === res.sale.id);
          return { type: "sale", payload: { sale: { ...full }, items: res.items.map((i) => ({ ...i })) } };
        },
      );
    },
    voidSale({ id }) {
      const invoiceNo = view.sales.find((x) => x.id === Number(id))?.invoiceNo;
      return mutate((db) => engine.voidSale(db, { id }), () => ({ type: "void", payload: { invoiceNo } }));
    },
    async getSale(a) {
      const r = engine.getSale(view, a || {});
      if (r.sale || !navigator.onLine) return structuredClone(r);
      try {
        return await remote.getSale(a);
      } catch {
        return r;
      }
    },
    async auditAppend({ event }) {
      const op = { opId: uid(), at: new Date().toISOString(), deviceId: device.id, type: "audit", payload: { event: { ...event } } };
      outbox.push(op);
      await persist(["outbox", "meta"]);
      emit();
      schedulePush();
      return { queued: true };
    },
    async backupRestore(arg) {
      if (!navigator.onLine) throw new Error("Restore requires an online connection to Google Sheets.");
      return remote.backupRestore(arg);
    },
    saveCustomer({ customer }) {
      const before = view.customers?.find((x) => x.id === customer?.id);
      return mutate(
        (db) => engine.saveCustomer(db, { customer }),
        (res) => ({ type: "customer.save", payload: { customer: { ...res.customer } } }),
      );
    },
    saveSettings(a) {
      return mutate((db) => engine.saveSettings(db, a), () => ({ type: "settings", payload: { settings: { ...a.settings } } }));
    },
    sync: (o) => sync({ pull: true, ...(o || {}) }),
    status: () => ({
      mode: "hybrid",
      online: navigator.onLine,
      syncing: status.syncing,
      pending: outbox.length,
      lastSyncAt: meta.lastSyncAt,
      lastPullAt: meta.lastPullAt,
      lastError: status.lastError,
      authRequired: status.authRequired,
      log: log.slice(),
    }),
    async clearLog() {
      log = [];
      await persist(["log"]);
      emit();
    },
    exportData: async () => ({
      app: "freshmart-pos",
      format: 1,
      mode: "hybrid",
      exportedAt: new Date().toISOString(),
      device,
      sheetUrl: cfg.url,
      hybrid: { snapshot, outbox, applied, meta, log },
    }),
    async importData(file) {
      const h = file && file.app === "freshmart-pos" && file.mode === "hybrid" ? file.hybrid : null;
      if (!h) throw new Error("This file isn't a “This PC + Google Sheets” backup of FreshMart POS");
      const known = new Set([...outbox, ...applied].map((o) => o.opId));
      // Anything in the file that we don't know about is re-queued; the sheet ignores ops it already has.
      const add = [...(h.applied || []), ...(h.outbox || [])].filter((o) => o && o.opId && !known.has(o.opId));
      outbox = [...add, ...outbox];
      if (!snapshot && h.snapshot) snapshot = { ...h.snapshot, url: cfg.url };
      meta.invSeq = Math.max(meta.invSeq, Number(h.meta?.invSeq) || 0);
      meta.tempSeq = Math.max(meta.tempSeq, Number(h.meta?.tempSeq) || 0);
      view = rebuild();
      await persist(["outbox", "snapshot", "meta"]);
      emit();
      schedulePush();
      return { restored: add.length };
    },
    dispose() {
      disposed = true;
      clearTimeout(pushTimer);
      clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    },
  };
}
