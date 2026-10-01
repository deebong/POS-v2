// Shared, dependency-free business logic (used by the demo engine and the UI).
// The Google Apps Script backend (apps-script/Code.gs) mirrors these rules.

export const DEFAULT_SETTINGS = {
  storeName: "FreshMart Grocery",
  address: "12, MG Road, Bengaluru, Karnataka 560001",
  phone: "+91 98765 43210",
  taxId: "GSTIN 29ABCDE1234F1Z5",
  currency: "₹",
  taxLabel: "GST",
  upiId: "",
  receiptFooter: "Thank you for shopping with us! Please visit again.",
  themeColor: "#0f9d58", // brand colour: buttons, icons, highlights
  sidebarTheme: "light", // light | brand | dark
  productImageMode: "emoji", // emoji | photo
  productLabelCode: "qr", // qr | barcode
};
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

export const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const isWeighed = (unit) => unit === "kg" || unit === "l";

/** Only https:// links and small base64 images are accepted as product photos. */
export function safeImageUrl(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if (s.length <= 50000 && /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return s;
  if (s.length <= 2000 && /^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return "";
}

/** "1.10.0" >= "1.2.0" style comparison; empty/unknown versions count as 0. */
export function versionAtLeast(v, min) {
  const a = String(v || "0").split(".").map(Number);
  const b = String(min).split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Billing maths. Prices are tax-exclusive; the discount applies to the subtotal and
 * tax is then calculated on each line's discounted amount.
 * lines: [{ price, qty, taxRate }]   discount: { type: 'none'|'percent'|'amount', value }
 */
export function calcTotals(lines, discount = { type: "none", value: 0 }) {
  const priced = lines.map((l) => ({ ...l, lineSubtotal: round2(l.price * l.qty) }));
  const subtotal = round2(priced.reduce((s, l) => s + l.lineSubtotal, 0));
  const v = Number(discount.value) || 0;
  let disc = 0;
  if (discount.type === "percent") disc = round2((subtotal * Math.min(Math.max(v, 0), 100)) / 100);
  else if (discount.type === "amount") disc = Math.min(round2(Math.max(v, 0)), subtotal);
  const ratio = subtotal > 0 ? disc / subtotal : 0;
  const out = priced.map((l) => ({ ...l, lineTax: round2(l.lineSubtotal * (1 - ratio) * (l.taxRate / 100)) }));
  const tax = round2(out.reduce((s, l) => s + l.lineTax, 0));
  return { lines: out, subtotal, discount: disc, tax, total: round2(subtotal - disc + tax) };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
export function invoiceNumber(id, date = new Date()) {
  const d = new Date(date);
  return `INV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(id, 5)}`;
}

/** Validates + normalises product input. Returns { data } or { error }. */
export function parseProduct(b) {
  const str = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const numOr = (v, fallback) => {
    if (v === "" || v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const name = str(b.name);
  if (!name) return { error: "Product name is required" };
  const price = numOr(b.price, 0);
  const cost = numOr(b.cost, 0);
  const taxRate = numOr(b.taxRate, 0);
  const stock = numOr(b.stock, 0);
  const reorderLevel = numOr(b.reorderLevel, 10);
  if ([price, cost, taxRate, stock, reorderLevel].some(Number.isNaN)) {
    return { error: "Price, cost, tax, stock and reorder level must be valid numbers" };
  }
  if (price < 0 || cost < 0 || stock < 0 || reorderLevel < 0) return { error: "Numbers cannot be negative" };
  if (taxRate < 0 || taxRate > 100) return { error: "Tax rate must be between 0 and 100" };
  let sku = str(b.sku, 40).toUpperCase();
  if (!sku) sku = "P-" + Date.now().toString(36).toUpperCase();
  return {
    data: {
      sku,
      barcode: str(b.barcode, 40) || null,
      name,
      category: str(b.category, 60) || "General",
      emoji: str(b.emoji, 8) || "🛒",
      unit: str(b.unit, 12).toLowerCase() || "pc",
      price: round2(price),
      cost: round2(cost),
      taxRate: round2(taxRate),
      stock: round3(stock),
      reorderLevel: round3(reorderLevel),
      isActive: b.isActive === undefined ? true : Boolean(b.isActive),
      imageUrl: safeImageUrl(b.imageUrl),
    },
  };
}
