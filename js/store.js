// Client state + data access. All persistence goes through data/backend.js
// (demo/localStorage or Google Sheets) — views never talk to a backend directly.
import { backend, getConfig } from "./data/backend.js";
import { DEFAULT_SETTINGS, versionAtLeast } from "./data/logic.js";

export { isWeighed } from "./data/logic.js";

export const HISTORY_DAYS = 90;

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  all: [], // every product (incl. inactive)
  products: [], // active products (what the POS sells)
  customers: [], // persistent customer profiles
  sales: [], // newest first, last HISTORY_DAYS days
  items: new Map(), // saleId -> line items
  meta: {
    mode: getConfig().mode,
    spreadsheetUrl: "",
    spreadsheetName: "",
    scriptVersion: "",
    syncedAt: null,
    syncing: false,
    error: null,
  },
};

const emit = (name) => window.dispatchEvent(new CustomEvent(name));
const byCatName = (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name);

function setProducts(list) {
  state.all = list.slice().sort(byCatName);
  state.products = state.all.filter((p) => p.isActive);
}
function upsertProducts(list) {
  const map = new Map(state.all.map((p) => [p.id, p]));
  for (const p of list) map.set(p.id, p);
  setProducts([...map.values()]);
}
function sortSales() {
  state.sales.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
}
function withCount(sale) {
  return { ...sale, itemCount: (state.items.get(sale.id) || []).length };
}

function ingest(d) {
  state.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  setProducts(d.products || []);
  state.customers = Array.isArray(d.customers) ? d.customers.slice() : [];
  state.items = new Map();
  for (const it of d.saleItems || []) {
    if (!state.items.has(it.saleId)) state.items.set(it.saleId, []);
    state.items.get(it.saleId).push(it);
  }
  state.sales = (d.sales || []).map((sale) => ({
    ...sale,
    paymentMethod: ["cash", "card", "upi"].includes(sale.paymentMethod) ? sale.paymentMethod : "cash",
  })).map(withCount);
  sortSales();
  state.meta.spreadsheetUrl = d.spreadsheetUrl || "";
  state.meta.spreadsheetName = d.spreadsheetName || "";
  state.meta.scriptVersion = d.version || "";
  state.meta.syncedAt = new Date();
  state.meta.error = null;
}

const signature = () =>
  JSON.stringify([
    state.all.map((p) => [p.id, p.stock, p.price, p.cost, p.name, p.isActive, p.updatedAt]),
    state.sales.map((s) => [s.id, s.status]),
    state.settings,
  ]);

/** Full (re)load from the active backend. Throws on failure. */
export async function loadAll() {
  state.meta.mode = getConfig().mode;
  state.meta.syncing = true;
  emit("sync:status");
  try {
    const incoming = await backend.bootstrap({ days: HISTORY_DAYS });
    const hadData = Boolean(state.all.length || state.sales.length);
    const incomingProducts = Array.isArray(incoming?.products) ? incoming.products : [];
    const incomingSales = Array.isArray(incoming?.sales) ? incoming.sales : [];
    const sameRemoteSource = Boolean(state.meta.spreadsheetUrl && incoming?.spreadsheetUrl && state.meta.spreadsheetUrl === incoming.spreadsheetUrl);
    if (getConfig().mode !== "local" && sameRemoteSource && hadData && !incomingProducts.length && !incomingSales.length) {
      throw new Error("Google Sheets returned an empty dataset. Your saved counter data was kept; sync was not applied.");
    }
    ingest(incoming);
  } catch (e) {
    state.meta.error = e.message || "Sync failed";
    throw e;
  } finally {
    state.meta.syncing = false;
    emit("sync:status");
  }
}

/**
 * Background refresh: never throws; emits `data:changed` only when something is different.
 * Offline-first mode pushes queued changes and downloads the latest from the sheet first.
 */
export async function refreshData() {
  if (state.meta.syncing) return false;
  if (getConfig().mode === "hybrid") {
    const before = signature();
    const synced = await backend.sync({ pull: true }).catch(() => null);
    if (synced?.data) {
      ingest(synced.data);
      const changed = signature() !== before;
      if (changed) emit("data:changed");
      return changed;
    }
    return false;
  }
  return reloadLocal();
}

/** Re-reads the active data source (no network in the "This PC" modes) and notifies views if it changed. */
export async function reloadLocal() {
  const before = signature();
  try {
    await loadAll();
  } catch {
    return false;
  }
  const changed = signature() !== before;
  if (changed) emit("data:changed");
  return changed;
}

/* ---------- mutations (each returns fresh data and keeps local state in sync) ---------- */

export async function saveProduct(product) {
  const res = await backend.saveProduct({ product });
  upsertProducts([res.product]);
  return res.product;
}

export async function deleteProduct(id) {
  await backend.deleteProduct({ id });
  setProducts(state.all.filter((p) => p.id !== id));
}

export async function adjustStock(args) {
  const res = await backend.adjustStock(args);
  upsertProducts([res.product]);
  return res.product;
}

export async function importProducts(products) {
  const res = await backend.importProducts({ products });
  upsertProducts(res.products);
  return res;
}

export async function checkout(payload) {
  const res = await backend.checkout(payload);
  upsertProducts(res.products || []);
  if (res.duplicate) {
    // A retry of a bill the server had already recorded: pull fresh stock levels & invoices.
    await refreshData();
  } else {
    state.items.set(res.sale.id, res.items);
    state.sales.unshift(withCount(res.sale));
    sortSales();
  }
  return res;
}

export async function voidSale(id) {
  const res = await backend.voidSale({ id });
  upsertProducts(res.products || []);
  state.items.set(res.sale.id, res.items);
  const i = state.sales.findIndex((s) => s.id === res.sale.id);
  if (i >= 0) state.sales[i] = withCount(res.sale);
  return res;
}

/** Adds products + invoices in one go (data files, demo data). Returns counts. */
export async function importBulk(payload) {
  const res = await backend.importBulk(payload);
  await loadAll();
  emit("data:changed");
  window.dispatchEvent(new CustomEvent("settings:changed"));
  return res;
}

/** Stores a product photo: Google Drive when connected, otherwise kept as-is on this PC. */
export const uploadImage = (dataUrl, name) => backend.uploadImage({ dataUrl, name });

/** True when the connected Apps Script supports bulk import, photos and colour settings (v1.2+). */
export const scriptUpToDate = () => getConfig().mode === "local" || versionAtLeast(state.meta.scriptVersion, "1.2.0");

export async function saveCustomer(customer) {
  const res = await backend.saveCustomer({ customer });
  const saved = res.customer;
  const i = state.customers.findIndex((x) => x.id === saved.id);
  if (i >= 0) state.customers[i] = saved; else state.customers.unshift(saved);
  window.dispatchEvent(new CustomEvent("data:changed"));
  return saved;
}

export async function saveSettings(settings) {
  const res = await backend.saveSettings({ settings });
  state.settings = { ...DEFAULT_SETTINGS, ...res.settings };
  return state.settings;
}

/** Finds an invoice locally, falling back to the backend for bills older than HISTORY_DAYS. */
export async function lookupInvoice(no) {
  const n = String(no || "").trim().toLowerCase();
  const sale = state.sales.find((s) => s.invoiceNo.toLowerCase() === n);
  if (sale) return { sale, items: state.items.get(sale.id) || [] };
  try {
    const r = await backend.getSale({ invoiceNo: String(no).trim() });
    return r && r.sale ? r : null;
  } catch {
    return null;
  }
}

/* ---------- lookups & helpers ---------- */

export const productById = (id) => state.products.find((p) => p.id === id) || null;

export function findByCode(code) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return null;
  return state.products.find((p) => p.sku.toLowerCase() === c || (p.barcode && p.barcode.toLowerCase() === c)) || null;
}

export function categoryCounts(list = state.products) {
  const map = new Map();
  for (const p of list) map.set(p.category, (map.get(p.category) || 0) + 1);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const CAT = {
  "Fruits & Veg": "#eaf8ef",
  "Dairy & Eggs": "#eaf2ff",
  Bakery: "#fff3df",
  "Meat & Seafood": "#ffecec",
  Beverages: "#e7f7fb",
  Snacks: "#fff8d9",
  Pantry: "#f6efe4",
  Household: "#eceeff",
  "Personal Care": "#f5ebff",
  Frozen: "#e4f3ff",
};
export const catTint = (c) => CAT[c] || "#eaf6ef";

export function stockStatus(p) {
  if (p.stock <= 0) return "out";
  if (p.stock <= p.reorderLevel) return "low";
  return "ok";
}
