// Local "server": every backend action implemented on a plain in-memory database object.
// Used by "This PC only" mode directly, and by the offline-first (PC + Google Sheets) mode, which
// applies each change locally first and replays not-yet-synced changes on top of the last download.
// The Google Apps Script backend (apps-script/Code.gs) implements the same rules.
import { SETTING_KEYS, calcTotals, invoiceNumber, num, parseProduct, round2, round3 } from "./logic.js";

export const emptyDb = () => ({ products: [], sales: [], saleItems: [], movements: [], settings: {} });

const nextId = (rows) => rows.reduce((m, r) => (r.id > m ? r.id : m), 0) + 1;
// Offline-first mode attaches db.$newId to hand out temporary (negative) ids until the sheet assigns real ones.
const newId = (db, table) => (typeof db.$newId === "function" ? db.$newId(table) : nextId(db[table]));
const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const cleanText = (v, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function pubSale(s) {
  const { clientRef, ...rest } = s; // eslint-disable-line no-unused-vars
  return rest;
}

/** Finds a product by id, falling back to SKU (ids of products created offline change after syncing). */
export function findProduct(db, id, sku) {
  const n = Number(id);
  if (n) {
    const p = db.products.find((x) => x.id === n);
    if (p) return p;
  }
  return sku ? db.products.find((x) => same(x.sku, sku)) || null : null;
}

function movement(db, p, change, reason, reference, at) {
  db.movements.push({
    id: newId(db, "movements"),
    createdAt: at,
    productId: p.id,
    sku: p.sku,
    name: p.name,
    change,
    reason,
    reference: reference || "",
  });
}

function assertUnique(db, data, id) {
  for (const p of db.products) {
    if (p.id === id) continue;
    if (same(p.sku, data.sku)) throw new Error("A product with this SKU already exists");
    if (data.barcode && p.barcode && same(p.barcode, data.barcode)) {
      throw new Error("A product with this barcode already exists");
    }
  }
}

export function bootstrap(db, { days = 90 } = {}) {
  const since = Date.now() - days * 86400000;
  const sales = db.sales.filter((s) => new Date(s.createdAt).getTime() >= since).map(pubSale);
  const ids = new Set(sales.map((s) => s.id));
  return {
    settings: db.settings,
    products: db.products,
    sales,
    saleItems: db.saleItems.filter((i) => ids.has(i.saleId)),
    spreadsheetUrl: "",
    spreadsheetName: "",
  };
}

export function saveProduct(db, { product }) {
  const { data, error } = parseProduct(product || {});
  if (!data) throw new Error(error);
  const id = Number(product.id) || 0;
  const now = new Date().toISOString();
  if (id) {
    const cur = db.products.find((p) => p.id === id);
    if (!cur) throw new Error("Product not found");
    assertUnique(db, data, id);
    const { stock, ...fields } = data; // eslint-disable-line no-unused-vars
    Object.assign(cur, fields, { updatedAt: now }); // stock only changes via adjustStock
    return { product: cur };
  }
  assertUnique(db, data, 0);
  const p = { id: newId(db, "products"), ...data, createdAt: now, updatedAt: now };
  db.products.push(p);
  if (p.stock > 0) movement(db, p, p.stock, "initial", "Opening stock", now);
  return { product: p };
}

export function importProducts(db, { products = [] }) {
  const created = [];
  let skipped = 0;
  const now = new Date().toISOString();
  for (const raw of products) {
    const { data } = parseProduct(raw || {});
    if (!data || db.products.some((p) => same(p.sku, data.sku) || (data.barcode && p.barcode && same(p.barcode, data.barcode)))) {
      skipped++;
      continue;
    }
    const p = { id: newId(db, "products"), ...data, createdAt: now, updatedAt: now };
    db.products.push(p);
    if (p.stock > 0) movement(db, p, p.stock, "initial", "Opening stock", now);
    created.push(p);
  }
  return { products: created, skipped };
}

export function deleteProduct(db, { id }) {
  const i = db.products.findIndex((p) => p.id === Number(id));
  if (i < 0) throw new Error("Product not found");
  db.products.splice(i, 1);
  return { ok: true };
}

/** lenient: used when replaying/syncing — clamps at zero instead of rejecting. */
export function adjustStock(db, { productId, mode, quantity, reason }, { lenient = false } = {}) {
  const p = db.products.find((x) => x.id === Number(productId));
  if (!p) throw new Error("Product not found");
  const m = mode === "remove" || mode === "set" ? mode : "add";
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0 || (m !== "set" && qty === 0)) throw new Error("Enter a valid quantity");
  const before = num(p.stock);
  let after = m === "add" ? before + qty : m === "remove" ? before - qty : qty;
  if (after < 0) {
    if (!lenient) throw new Error("Stock cannot go below zero");
    after = 0;
  }
  const change = round3(after - before);
  const now = new Date().toISOString();
  p.stock = round3(after);
  p.updatedAt = now;
  if (change !== 0) movement(db, p, change, m === "add" ? "restock" : "adjustment", cleanText(reason, 80), now);
  return { product: p };
}

/**
 * Records an already-priced sale: stores it and takes the items out of stock. Never rejects for stock —
 * a sale that happened at the till (possibly offline) is a fact; stock may go negative and get corrected.
 */
export function applySale(db, sale, items) {
  const s = { ...sale };
  const touched = [];
  const its = items.map((raw) => {
    const it = { ...raw };
    const p = findProduct(db, it.productId, it.sku);
    if (p) {
      it.productId = p.id;
      p.stock = round3(num(p.stock) - num(it.qty));
      p.updatedAt = s.createdAt;
      movement(db, p, -num(it.qty), "sale", s.invoiceNo, s.createdAt);
      if (!touched.includes(p)) touched.push(p);
    }
    return it;
  });
  db.sales.push(s);
  db.saleItems.push(...its);
  return { sale: s, items: its, products: touched };
}

/** opts.invoiceNo: optional (date) => string, used for device-scoped invoice numbers in offline mode. */
export function checkout(db, body, opts = {}) {
  if (!body || !Array.isArray(body.items) || !body.items.length) throw new Error("Cart is empty");
  if (body.items.length > 150) throw new Error("Too many lines in one bill");

  // Idempotency: a retried request with the same clientRef returns the original bill.
  if (body.clientRef) {
    const dup = db.sales.find((s) => s.clientRef === body.clientRef);
    if (dup) {
      return { sale: pubSale(dup), items: db.saleItems.filter((i) => i.saleId === dup.id), products: [], duplicate: true };
    }
  }

  const wanted = new Map();
  for (const it of body.items) {
    const pid = Number(it.productId);
    const qty = Number(it.qty);
    if (!Number.isInteger(pid) || pid === 0 || !Number.isFinite(qty) || qty <= 0) throw new Error("Invalid item in cart");
    wanted.set(pid, round3((wanted.get(pid) || 0) + qty));
  }
  const lines = [];
  for (const [pid, qty] of wanted) {
    const p = db.products.find((x) => x.id === pid);
    if (!p || !p.isActive) throw new Error("A product in the cart is no longer available");
    if (num(p.stock) < qty) throw new Error(`Not enough stock for ${p.name} (available: ${num(p.stock)} ${p.unit})`);
    lines.push({ p, qty });
  }

  const dType = body.discountType === "percent" || body.discountType === "amount" ? body.discountType : "none";
  const calc = calcTotals(
    lines.map(({ p, qty }) => ({ price: p.price, qty, taxRate: p.taxRate })),
    { type: dType, value: Number(body.discountValue) || 0 },
  );
  const method = ["cash", "card", "upi"].includes(body.paymentMethod) ? body.paymentMethod : "cash";
  let paid = method === "cash" ? Number(body.amountPaid) : calc.total;
  if (!Number.isFinite(paid)) paid = calc.total;
  if (paid + 0.001 < calc.total) throw new Error("Amount received is less than the total due");
  paid = round2(paid);

  const now = new Date();
  const id = newId(db, "sales");
  const invoiceNo = typeof opts.invoiceNo === "function" ? opts.invoiceNo(now) : invoiceNumber(id, now);
  const sale = {
    id,
    invoiceNo,
    customerName: cleanText(body.customerName),
    customerPhone: cleanText(body.customerPhone, 24),
    subtotal: calc.subtotal,
    discount: calc.discount,
    tax: calc.tax,
    total: calc.total,
    paymentMethod: method,
    amountPaid: paid,
    changeDue: method === "cash" ? round2(paid - calc.total) : 0,
    status: "completed",
    note: cleanText(body.note, 200),
    createdAt: now.toISOString(),
    voidedAt: null,
    clientRef: cleanText(body.clientRef, 64),
  };
  const items = lines.map(({ p, qty }, i) => ({
    id: newId(db, "saleItems"),
    saleId: id,
    productId: p.id,
    name: p.name,
    sku: p.sku,
    emoji: p.emoji,
    unit: p.unit,
    price: p.price,
    qty,
    taxRate: p.taxRate,
    lineSubtotal: calc.lines[i].lineSubtotal,
    lineTax: calc.lines[i].lineTax,
  }));
  const res = applySale(db, sale, items);
  return { sale: pubSale(res.sale), items: res.items, products: lines.map((l) => l.p) };
}

export function voidSale(db, { id, invoiceNo }, { lenient = false } = {}) {
  const sale = db.sales.find((s) => (id ? s.id === Number(id) : same(s.invoiceNo, invoiceNo)));
  if (!sale) {
    if (lenient) return null;
    throw new Error("Invoice not found");
  }
  if (sale.status === "voided") {
    if (lenient) return null;
    throw new Error("This invoice is already voided");
  }
  const items = db.saleItems.filter((i) => i.saleId === sale.id);
  const iso = new Date().toISOString();
  const touched = [];
  for (const it of items) {
    const p = findProduct(db, it.productId, it.sku);
    if (!p) continue;
    p.stock = round3(p.stock + it.qty);
    p.updatedAt = iso;
    movement(db, p, it.qty, "void", sale.invoiceNo, iso);
    touched.push(p);
  }
  sale.status = "voided";
  sale.voidedAt = iso;
  return { sale: pubSale(sale), items, products: touched };
}

/**
 * Adds products (matched by SKU) and historical invoices (matched by invoice number) — used by
 * "Import data file" and "Load demo data". Nothing that already exists is changed, so it is safe to
 * import the same file twice. Imported invoices don't change stock (they're history).
 * payload: { products: [...], sales: [{ ...sale, items: [...] }], renumber?: boolean, settings?: {...} }
 */
export function importBulk(db, payload = {}) {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const sales = Array.isArray(payload.sales) ? payload.sales : [];
  const now = new Date().toISOString();
  const out = { productsAdded: 0, productsSkipped: 0, salesAdded: 0, salesSkipped: 0 };
  for (const raw of products) {
    const { data } = parseProduct(raw || {});
    if (!data || db.products.some((p) => same(p.sku, data.sku) || (data.barcode && p.barcode && same(p.barcode, data.barcode)))) {
      out.productsSkipped++;
      continue;
    }
    const p = { id: newId(db, "products"), ...data, createdAt: now, updatedAt: now };
    db.products.push(p);
    if (p.stock > 0) movement(db, p, p.stock, "initial", "Opening stock", now);
    out.productsAdded++;
  }
  const invoices = new Set(db.sales.map((s) => String(s.invoiceNo).toLowerCase()));
  let itemId = nextId(db.saleItems);
  for (const s of sales) {
    const items = Array.isArray(s && s.items) ? s.items : [];
    if (!items.length) {
      out.salesSkipped++;
      continue;
    }
    const t = s.createdAt ? new Date(s.createdAt) : new Date();
    const created = Number.isNaN(t.getTime()) ? now : t.toISOString();
    const id = newId(db, "sales");
    const invoiceNo = payload.renumber || !s.invoiceNo ? invoiceNumber(id, new Date(created)) : String(s.invoiceNo).slice(0, 40);
    if (invoices.has(invoiceNo.toLowerCase())) {
      out.salesSkipped++;
      continue;
    }
    invoices.add(invoiceNo.toLowerCase());
    const voided = s.status === "voided";
    db.sales.push({
      id,
      invoiceNo,
      customerName: cleanText(s.customerName),
      customerPhone: cleanText(s.customerPhone, 24),
      subtotal: num(s.subtotal),
      discount: num(s.discount),
      tax: num(s.tax),
      total: num(s.total),
      paymentMethod: ["cash", "card", "upi"].includes(s.paymentMethod) ? s.paymentMethod : "cash",
      amountPaid: num(s.amountPaid),
      changeDue: num(s.changeDue),
      status: voided ? "voided" : "completed",
      note: cleanText(s.note, 200),
      createdAt: created,
      voidedAt: voided ? s.voidedAt || created : null,
      clientRef: null,
    });
    for (const it of items) {
      const p = findProduct(db, 0, it.sku);
      db.saleItems.push({
        id: itemId++,
        saleId: id,
        productId: p ? p.id : 0,
        name: String(it.name || "").slice(0, 120),
        sku: String(it.sku || "").slice(0, 40),
        emoji: String(it.emoji || "🛒").slice(0, 8),
        unit: String(it.unit || "pc").slice(0, 12),
        price: num(it.price),
        qty: num(it.qty),
        taxRate: num(it.taxRate),
        lineSubtotal: num(it.lineSubtotal),
        lineTax: num(it.lineTax),
      });
    }
    out.salesAdded++;
  }
  if (payload.settings && typeof payload.settings === "object") saveSettings(db, { settings: payload.settings });
  return out;
}

export function getSale(db, { invoiceNo, id }) {
  const sale = db.sales.find((s) => (id ? s.id === Number(id) : same(s.invoiceNo, invoiceNo || "")));
  if (!sale) return { sale: null, items: [] };
  return { sale: pubSale(sale), items: db.saleItems.filter((i) => i.saleId === sale.id) };
}

export function saveSettings(db, { settings = {} }) {
  for (const k of SETTING_KEYS) {
    if (typeof settings[k] === "string") db.settings[k] = settings[k].trim().slice(0, 300);
  }
  return { settings: db.settings };
}

/**
 * Re-applies a queued (not yet confirmed) operation on top of a fresh download from the sheet.
 * Must be tolerant: the sheet may have changed in the meantime (other counters, deleted products…).
 */
export function replayOp(db, op) {
  const p = op.payload || {};
  switch (op.type) {
    case "sale":
      if (p.sale && !db.sales.some((s) => s.invoiceNo === p.sale.invoiceNo)) applySale(db, p.sale, p.items || []);
      return;
    case "void":
      voidSale(db, { invoiceNo: p.invoiceNo }, { lenient: true });
      return;
    case "product.save": {
      const data = p.product || {};
      if (p.isCreate) {
        if (!db.products.some((x) => same(x.sku, data.sku))) db.products.push({ ...data });
        return;
      }
      const target = findProduct(db, p.id, p.matchSku);
      if (target) {
        const { stock, id, createdAt, ...fields } = data; // eslint-disable-line no-unused-vars
        if (!db.products.some((x) => x !== target && same(x.sku, fields.sku))) Object.assign(target, fields);
      }
      return;
    }
    case "product.delete": {
      const x = findProduct(db, p.id, p.sku);
      if (x) db.products.splice(db.products.indexOf(x), 1);
      return;
    }
    case "stock": {
      const x = findProduct(db, p.id, p.sku);
      if (x) adjustStock(db, { productId: x.id, mode: p.mode, quantity: p.quantity, reason: p.reason }, { lenient: true });
      return;
    }
    case "import":
      for (const q of p.products || []) if (!db.products.some((x) => same(x.sku, q.sku))) db.products.push({ ...q });
      return;
    case "settings":
      saveSettings(db, { settings: p.settings || {} });
      return;
    default:
  }
}
