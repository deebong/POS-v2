// Import & export: portable data files (.json) and spreadsheets (.csv). Works in every storage mode.
import { backend, getConfig } from "./data/backend.js";
import { demoPayload } from "./data/sample.js";
import { HISTORY_DAYS, state } from "./store.js";

const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
/** CSV with a BOM so Excel shows ₹ and other symbols correctly. */
export const toCsv = (rows) => "\uFEFF" + rows.map((r) => r.map(quote).join(",")).join("\r\n");

export const PRODUCT_CSV_HEAD = ["SKU", "Barcode", "Name", "Category", "Unit", "Price", "Cost", "Tax %", "Stock", "Reorder level", "Active", "Emoji", "Image URL"];
export const productCsvRow = (p) => [
  p.sku, p.barcode, p.name, p.category, p.unit, p.price, p.cost, p.taxRate, p.stock, p.reorderLevel, p.isActive ? "yes" : "no", p.emoji, p.imageUrl || "",
];

const group = (items) => {
  const m = new Map();
  for (const it of items || []) {
    if (!m.has(it.saleId)) m.set(it.saleId, []);
    m.get(it.saleId).push(it);
  }
  return m;
};

async function source() {
  if (getConfig().mode === "local") {
    const d = await backend.exportData();
    if (d && d.local) {
      return { products: d.local.products, sales: d.local.sales, items: group(d.local.saleItems), settings: { ...state.settings, ...d.local.settings }, complete: true };
    }
  }
  return { products: state.all, sales: state.sales, items: state.items, settings: state.settings, complete: false };
}

/** Everything in one portable file: settings, products, invoices + lines. */
export async function buildExport() {
  const src = await source();
  return {
    app: "freshmart-pos",
    format: 2,
    exportedAt: new Date().toISOString(),
    note: src.complete ? "Complete data" : `Invoices from the last ${HISTORY_DAYS} days`,
    settings: src.settings,
    products: src.products.map(({ id, createdAt, updatedAt, ...p }) => p), // eslint-disable-line no-unused-vars
    sales: src.sales.map(({ clientRef, itemCount, ...s }) => ({ // eslint-disable-line no-unused-vars
      ...s,
      items: (src.items.get(s.id) || []).map(({ id, saleId, ...it }) => it), // eslint-disable-line no-unused-vars
    })),
  };
}

export async function productsCsv() {
  const src = await source();
  return toCsv([PRODUCT_CSV_HEAD, ...src.products.map(productCsvRow)]);
}

export async function invoicesCsv() {
  const src = await source();
  return toCsv([
    ["Invoice", "Date", "Customer", "Phone", "Items", "Payment", "Subtotal", "Discount", "Tax", "Total", "Paid", "Change", "Status"],
    ...src.sales.map((s) => [
      s.invoiceNo, new Date(s.createdAt).toLocaleString(), s.customerName, s.customerPhone, (src.items.get(s.id) || []).length,
      s.paymentMethod, s.subtotal, s.discount, s.tax, s.total, s.amountPaid, s.changeDue, s.status,
    ]),
  ]);
}

export async function invoiceLinesCsv() {
  const src = await source();
  const inv = new Map(src.sales.map((s) => [s.id, s]));
  const rows = [["Invoice", "Date", "SKU", "Product", "Qty", "Unit", "Price", "Tax %", "Line total", "Line tax", "Status"]];
  for (const [saleId, items] of src.items) {
    const s = inv.get(saleId);
    if (!s) continue;
    for (const it of items) {
      rows.push([s.invoiceNo, new Date(s.createdAt).toLocaleString(), it.sku, it.name, it.qty, it.unit, it.price, it.taxRate, it.lineSubtotal, it.lineTax, s.status]);
    }
  }
  return toCsv(rows);
}

/** Accepts our v2 data files and the older "This PC" / "PC + Sheets" backup files. */
export function toPortable(data) {
  if (!data || data.app !== "freshmart-pos") throw new Error("This isn't a FreshMart POS data file");
  if (data.format === 2) return { products: data.products || [], sales: data.sales || [], settings: data.settings || null };
  const src = data.mode === "local" ? data.local : data.mode === "hybrid" ? data.hybrid && data.hybrid.snapshot : null;
  if (!src) throw new Error("Unknown data file format");
  const by = group(src.saleItems);
  return {
    products: src.products || [],
    sales: (src.sales || []).map((s) => ({ ...s, items: by.get(s.id) || [] })),
    settings: src.settings || null,
  };
}

export { demoPayload };
