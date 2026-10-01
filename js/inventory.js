// Inventory management
import { LABEL_SIZES, printLabels } from "./labels.js";
import { getConfig } from "./data/backend.js";
import { fileToDataUrl, mediaHtml, photoMode, toImageUrl } from "./media.js";
import { barcodeSvg, barcodeUrl } from "./barcode.js";
import { qrPngBlob, qrSvg, qrUrl } from "./qr.js";
import { PRODUCT_CSV_HEAD, productCsvRow, toCsv } from "./transfer.js";
import {
  adjustStock, catTint, categoryCounts, deleteProduct, importProducts, saveProduct, scriptUpToDate, state, stockStatus,
  uploadImage,
} from "./store.js";
import {
  $, $$, confirmDialog, debounce, downloadFile, esc, hydrateIcons, icon, money, num, openModal, toast,
} from "./ui.js";

const EMOJIS = "🍎🍌🍇🍓🍊🍋🍉🍍🥭🍑🍒🥝🍅🥑🥦🥕🌽🥔🧅🧄🍄🥬🥒🌶️🫑🍞🥐🥖🥯🧀🥚🥛🧈🥩🍗🥓🐟🍤🍕🍝🍚🍜🍫🍪🍿🥜🍯🧂🥫🫒☕🍵🥤🧃💧🍺🍷🧴🧼🧻🧽🪥🧺🗑️🍨🫛🛒".match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu) || [];
const UNITS = ["pc", "kg", "l", "pack", "dozen", "box"];

function ean13() {
  let base = "890";
  for (let i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (sum % 10)) % 10);
}

/* ------------------------------ product form ------------------------------ */
export function openProductForm(product, { onSaved } = {}) {
  const editing = !!product;
  const p = product || { name: "", category: "", emoji: "🛒", unit: "pc", sku: "", barcode: "", price: "", cost: "", taxRate: 0, stock: 0, reorderLevel: 10, isActive: true };
  const cats = categoryCounts(state.all).map(([c]) => c);

  const modal = openModal({
    title: editing ? "Edit product" : "Add product",
    sub: editing ? p.sku : "Add a new item to your catalogue",
    size: "lg",
    body: `
    <form id="pf" class="form-grid" autocomplete="off">
      <div class="field span-2"><label>Product name *</label><input class="input" name="name" required maxlength="120" value="${esc(p.name)}" placeholder="e.g. Organic Bananas" /></div>
      <div class="field"><label>Category</label><input class="input" name="category" list="catList" value="${esc(p.category)}" placeholder="e.g. Fruits & Veg" />
        <datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
      <div class="field"><label>Sold by (unit)</label><select class="select" name="unit">${UNITS.map((u) => `<option ${u === p.unit ? "selected" : ""}>${u}</option>`).join("")}</select>
        <span class="hint">kg / l allow decimal quantities at the till</span></div>
      <div class="field"><label>SKU <span class="muted">(QR code value)</span></label><input class="input" name="sku" maxlength="40" value="${esc(p.sku)}" placeholder="Auto-generated if empty" /></div>
      <div class="field"><label>Barcode <span class="muted">(optional)</span></label>
        <div class="input-group"><input class="input" name="barcode" maxlength="40" value="${esc(p.barcode || "")}" placeholder="EAN / UPC" />
        <button type="button" class="btn btn-outline" id="genBarcode" style="border-radius:0 12px 12px 0;border-left:0">Generate</button></div></div>
      <div class="field"><label>Selling price *</label><div class="input-group"><span class="addon">${esc(state.settings.currency)}</span><input class="input" name="price" type="number" step="0.01" min="0" required value="${p.price}" /></div></div>
      <div class="field"><label>Cost price</label><div class="input-group"><span class="addon">${esc(state.settings.currency)}</span><input class="input" name="cost" type="number" step="0.01" min="0" value="${p.cost}" /></div></div>
      <div class="field"><label>${esc(state.settings.taxLabel)} rate</label><div class="input-group"><input class="input" name="taxRate" type="number" step="0.01" min="0" max="100" value="${p.taxRate}" /><span class="addon">%</span></div></div>
      <div class="field"><label>Reorder level</label><input class="input" name="reorderLevel" type="number" step="0.001" min="0" value="${p.reorderLevel}" /><span class="hint">Low-stock alert triggers at or below this</span></div>
      ${
        editing
          ? `<div class="field"><label>Current stock</label><input class="input" value="${num(p.stock)} ${esc(p.unit)}" disabled /><span class="hint">Use “Restock” to change stock levels</span></div>`
          : `<div class="field"><label>Opening stock</label><input class="input" name="stock" type="number" step="0.001" min="0" value="0" /></div>`
      }
      <div class="field"><label>Active</label><div style="display:flex;align-items:center;gap:10px;height:42px"><label class="switch"><input type="checkbox" name="isActive" ${p.isActive ? "checked" : ""} /><span></span></label><span class="muted">Visible at the POS</span></div></div>
      ${
        photoMode()
          ? `<div class="field span-2"><label>Product photo</label>
        <div class="photo-row">
          <div class="photo-preview" id="phPreview"></div>
          <div class="photo-actions">
            <div class="btn-row tight" style="flex-wrap:wrap;gap:8px">
              <label class="btn btn-outline btn-sm">${icon("upload", "sm")} Choose photo from this PC…<input type="file" accept="image/*" id="phFile" hidden /></label>
              <button type="button" class="btn btn-ghost btn-sm" id="phRemove">Remove photo</button>
            </div>
            <div class="input-group"><input class="input input-sm" id="phUrl" placeholder="…or paste an image link / Google Drive share link" /><button type="button" class="btn btn-sm btn-outline" id="phUse" style="border-radius:0 9px 9px 0;border-left:0">Use link</button></div>
            <span class="hint" id="phHint"></span>
          </div>
        </div>
        <input type="hidden" name="imageUrl" value="${esc(p.imageUrl || "")}" /></div>`
          : `<input type="hidden" name="imageUrl" value="${esc(p.imageUrl || "")}" />`
      }
      <div class="field span-2"><label>${photoMode() ? "Icon <span class=\"muted\">(shown when there's no photo)</span>" : "Icon"}</label>
        <div style="display:flex;gap:10px;align-items:center"><input class="input emoji-input" name="emoji" maxlength="8" value="${esc(p.emoji)}" /><span class="muted">Pick an icon or paste any emoji</span></div>
        <div class="emoji-grid" id="emojiGrid">${EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join("")}</div></div>
    </form>`,
    footer: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="pfSave">${icon("check")} ${editing ? "Save changes" : "Add product"}</button>`,
  });
  const form = modal.$("#pf");
  modal.$("[data-cancel]").onclick = () => modal.close();
  modal.$("#genBarcode").onclick = () => { form.barcode.value = ean13(); };
  modal.$("#emojiGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-e]");
    if (b) form.emoji.value = b.dataset.e;
  });

  let saving = false;
  /* ----- product photo ----- */
  if (photoMode()) {
    const cloud = getConfig().mode !== "local";
    const hint = modal.$("#phHint");
    const baseHint = cloud
      ? scriptUpToDate()
        ? "Photos you choose are uploaded to your Google Drive (folder “FreshMart POS Images”) and the link is saved in the sheet. Drive links must be shared as “Anyone with the link”."
        : "Update Code.gs to v1.2 to upload photos to Google Drive. Until then photos are stored in the sheet (small size)."
      : "Photos are resized and stored with the product on this PC. You can also paste a web or Google Drive link.";
    const setPhoto = (url) => {
      form.imageUrl.value = url || "";
      const box = modal.$("#phPreview");
      box.innerHTML = url
        ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer" />`
        : `<span class="emo">${esc(form.emoji.value || "🛒")}</span><span class="muted" style="font-size:12px">No photo</span>`;
      const img = box.querySelector("img");
      if (img) {
        img.addEventListener("error", () => {
          box.innerHTML = `<span class="emo">${esc(form.emoji.value || "🛒")}</span><span class="muted" style="font-size:11px;text-align:center;padding:0 6px">Can't load this image</span>`;
        });
      }
      modal.$("#phUrl").value = url && !url.startsWith("data:") ? url : "";
    };
    setPhoto(form.imageUrl.value);
    hint.textContent = baseHint;
    modal.$("#phFile").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      hint.textContent = "Preparing photo…";
      try {
        if (cloud && scriptUpToDate() && navigator.onLine) {
          try {
            hint.textContent = "Uploading to Google Drive…";
            const big = await fileToDataUrl(file, { max: 800, limit: 1500000 });
            const res = await uploadImage(big, form.sku.value || form.name.value || "product");
            setPhoto(res.url);
            toast(res.warning || "Photo saved to Google Drive", res.warning ? "warn" : "success");
            hint.textContent = baseHint;
            return;
          } catch (err) {
            toast(`Couldn't upload to Google Drive (${err.message}). The photo will be stored in the sheet instead.`, "warn");
          }
        }
        setPhoto(await fileToDataUrl(file));
        hint.textContent = baseHint;
      } catch (err) {
        hint.textContent = baseHint;
        toast(err.message, "error");
      }
    });
    modal.$("#phUse").onclick = () => {
      const url = toImageUrl(modal.$("#phUrl").value);
      if (!url) return toast("Paste an https:// image link or a Google Drive share link", "error");
      setPhoto(url);
    };
    modal.$("#phRemove").onclick = () => setPhoto("");
  }

  const save = async () => {
    if (saving || !form.reportValidity()) return;
    const body = {
      imageUrl: form.imageUrl.value,
      id: editing ? p.id : undefined,
      name: form.name.value,
      category: form.category.value,
      unit: form.unit.value,
      sku: form.sku.value,
      barcode: form.barcode.value,
      price: form.price.value,
      cost: form.cost.value,
      taxRate: form.taxRate.value,
      reorderLevel: form.reorderLevel.value,
      emoji: form.emoji.value,
      isActive: form.isActive.checked,
    };
    if (!editing) body.stock = form.stock.value;
    const btn = modal.$("#pfSave");
    saving = true;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await saveProduct(body);
      toast(editing ? "Product updated" : "Product added");
      modal.close();
      if (onSaved) onSaved();
    } catch (e) {
      toast(e.message, "error");
      saving = false;
      btn.disabled = false;
      btn.innerHTML = `${icon("check")} ${editing ? "Save changes" : "Add product"}`;
    }
  };
  modal.$("#pfSave").onclick = save;
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  form.name.focus();
}

/* ------------------------------ stock adjust ------------------------------ */
export function openStockModal(p, { onSaved } = {}) {
  let mode = "add";
  const modal = openModal({
    title: "Adjust stock",
    size: "sm",
    body: "",
    footer: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="stSave">Update stock</button>`,
  });
  modal.$("[data-cancel]").onclick = () => modal.close();
  const step = p.unit === "kg" || p.unit === "l" ? "0.001" : "1";

  modal.body.innerHTML = `
    <div class="cell-product" style="margin-bottom:16px"><span class="thumb" style="background:${catTint(p.category)}">${mediaHtml(p)}</span>
      <div><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.sku)} · currently <b>${num(p.stock)} ${esc(p.unit)}</b></div></div></div>
    <div class="segmented full" id="stMode" style="margin-bottom:16px">
      <button data-m="add" class="active">Add stock</button><button data-m="remove">Remove</button><button data-m="set">Set to</button></div>
    <div class="field"><label id="stLabel">Quantity to add (${esc(p.unit)})</label><input class="input" id="stQty" type="number" min="0" step="${step}" placeholder="0" style="font-size:18px;font-weight:700;height:50px" /></div>
    <div class="field" style="margin-top:12px"><label>Reason <span class="muted">(optional)</span></label>
      <input class="input" id="stReason" list="stReasons" placeholder="e.g. Supplier delivery" /><datalist id="stReasons"><option value="Supplier delivery"><option value="Customer return"><option value="Damaged"><option value="Expired"><option value="Stock count correction"></datalist></div>
    <div class="change-box" id="stPreview" style="margin-top:16px"></div>`;

  const qtyEl = modal.$("#stQty");
  const preview = () => {
    const q = Number(qtyEl.value) || 0;
    const next = mode === "add" ? p.stock + q : mode === "remove" ? p.stock - q : q;
    const box = modal.$("#stPreview");
    box.className = "change-box" + (next < 0 ? " short" : "");
    box.innerHTML = `<span>New stock level</span><b>${next < 0 ? "Not allowed" : num(next) + " " + esc(p.unit)}</b>`;
    modal.$("#stSave").disabled = next < 0 || (mode !== "set" && q <= 0) || (mode === "set" && qtyEl.value === "");
  };
  modal.$("#stMode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    mode = b.dataset.m;
    $$("#stMode button", modal.el).forEach((x) => x.classList.toggle("active", x === b));
    modal.$("#stLabel").textContent = mode === "add" ? `Quantity to add (${p.unit})` : mode === "remove" ? `Quantity to remove (${p.unit})` : `New stock level (${p.unit})`;
    preview();
    qtyEl.focus();
  });
  qtyEl.addEventListener("input", preview);
  modal.el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !modal.$("#stSave").disabled) modal.$("#stSave").click(); });
  let saving = false;
  modal.$("#stSave").onclick = async () => {
    if (saving) return;
    saving = true;
    modal.$("#stSave").disabled = true;
    try {
      await adjustStock({ productId: p.id, mode, quantity: Number(qtyEl.value), reason: modal.$("#stReason").value });
      toast("Stock updated");
      modal.close();
      if (onSaved) onSaved();
    } catch (e) {
      saving = false;
      modal.$("#stSave").disabled = false;
      toast(e.message, "error");
    }
  };
  preview();
  qtyEl.focus();
}

/* ------------------------------ QR modal ------------------------------ */
export function openProductQR(p) {
  const type = state.settings.productLabelCode === "barcode" ? "barcode" : "qr";
  const code = type === "barcode" ? (p.barcode || p.sku) : p.sku;
  const typeName = type === "barcode" ? "Barcode" : "QR code";
  const modal = openModal({
    title: `Product ${typeName}`,
    sub: "Scan at the POS to add this item to the bill",
    size: "md",
    body: `
    <div class="qr-modal">
      <div class="qr-frame"><img class="${type === "barcode" ? "barcode-img" : "qr-img"}" alt="${typeName} for ${esc(code)}" src="${type === "barcode" ? barcodeUrl(code) : qrUrl(code)}" /></div>
      <div>
        <div class="cell-product"><span class="thumb" style="background:${catTint(p.category)}">${mediaHtml(p)}</span><div><div class="name" style="font-size:16px">${esc(p.name)}</div><div class="meta">${esc(p.category)}</div></div></div>
        <dl class="kv"><dt>SKU</dt><dd class="mono">${esc(p.sku)}</dd><dt>Barcode</dt><dd class="mono">${esc(p.barcode || "—")}</dd><dt>Label code</dt><dd class="mono">${esc(code)}</dd><dt>Price</dt><dd>${money(p.price)} / ${esc(p.unit)}</dd></dl>
        <div style="display:flex;gap:10px">
          <div class="field" style="flex:1"><label>Label size</label><select class="select input-sm" id="qSize" style="height:38px">${Object.entries(LABEL_SIZES).map(([k, v]) => `<option value="${k}" ${k === "md" ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div class="field" style="width:78px"><label>Copies</label><input class="input" id="qCopies" type="number" min="1" max="50" value="1" style="height:38px" /></div>
        </div>
      </div>
    </div>`,
    footer: `
      <button class="btn btn-outline left" data-dl="svg">${icon("download")} SVG</button>
      <button class="btn btn-outline" data-dl="png">${icon("download")} PNG</button>
      <button class="btn btn-primary" id="qPrint">${icon("printer")} Print label</button>`,
  });
  modal.$('[data-dl="svg"]').onclick = () => downloadFile(`${p.sku}-${type}.svg`, type === "barcode" ? barcodeSvg(code) : qrSvg(code, { size: 512 }), "image/svg+xml");
  modal.$('[data-dl="png"]').onclick = async () => {
    try {
      if (type === "barcode") {
        const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(barcodeSvg(code));
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 1200; canvas.height = 420;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 20, 20, canvas.width - 40, canvas.height - 40);
          canvas.toBlob((blob) => blob && downloadFile(`${p.sku}-barcode.png`, blob, "image/png"), "image/png");
        };
        img.src = src;
        return;
      }
      downloadFile(`${p.sku}.png`, await qrPngBlob(code, 800), "image/png");
    } catch (e) {
      toast(e.message, "error");
    }
  };
  modal.$("#qPrint").onclick = () => {
    const copies = Math.min(Math.max(parseInt(modal.$("#qCopies").value, 10) || 1, 1), 50);
    printLabels([{ product: p, copies }], { size: modal.$("#qSize").value, showPrice: true });
  };
}

/** Quick card shown when a product code is scanned outside the POS. */
export function showProductCard(p, { onSaved } = {}) {
  const st = stockStatus(p);
  const modal = openModal({
    title: p.name,
    sub: `${p.sku} · ${p.category}`,
    size: "sm",
    body: `
    <div style="text-align:center;padding:4px 0 8px"><div class="thumb" style="width:72px;height:72px;font-size:40px;margin:0 auto 10px;background:${catTint(p.category)}">${mediaHtml(p)}</div>
      <div style="font-size:28px;font-weight:800">${money(p.price)}<span class="muted" style="font-size:14px;font-weight:600"> /${esc(p.unit)}</span></div>
      <div style="margin-top:8px"><span class="badge ${st === "out" ? "badge-red" : st === "low" ? "badge-amber" : "badge-green"}">${num(p.stock)} ${esc(p.unit)} in stock</span></div></div>`,
    footer: `<button class="btn btn-outline" data-qr>${icon("qr")} QR</button><button class="btn btn-outline" data-edit>${icon("edit")} Edit</button><button class="btn btn-primary" data-stock>${icon("plus")} Restock</button>`,
  });
  modal.$("[data-qr]").onclick = () => { modal.close(); openProductQR(p); };
  modal.$("[data-edit]").onclick = () => { modal.close(); openProductForm(p, { onSaved }); };
  modal.$("[data-stock]").onclick = () => { modal.close(); openStockModal(p, { onSaved }); };
}

/* ------------------------------ CSV import ------------------------------ */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const CSV_HEAD = PRODUCT_CSV_HEAD;

function csvToProducts(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const idx = {};
  rows[0].forEach((h, i) => { idx[norm(h)] = i; });
  const get = (r, ...keys) => {
    for (const k of keys) if (idx[k] !== undefined) return (r[idx[k]] ?? "").trim();
    return "";
  };
  return rows.slice(1).map((r) => ({
    sku: get(r, "sku"),
    barcode: get(r, "barcode"),
    name: get(r, "name", "product"),
    category: get(r, "category"),
    unit: get(r, "unit"),
    price: get(r, "price", "sellingprice"),
    cost: get(r, "cost", "costprice"),
    taxRate: get(r, "tax", "taxrate"),
    stock: get(r, "stock", "qty", "quantity"),
    reorderLevel: get(r, "reorderlevel", "reorder"),
    emoji: get(r, "emoji", "icon"),
    imageUrl: toImageUrl(get(r, "imageurl", "image", "photo", "photourl")),
    isActive: !/^(no|false|0|inactive)$/i.test(get(r, "active") || "yes"),
  })).filter((p) => p.name);
}

export function openImportModal({ onSaved } = {}) {
  let parsed = [];
  const modal = openModal({
    title: "Import products from CSV",
    sub: "Add many products at once — existing SKUs are skipped, never overwritten",
    size: "md",
    body: `
      <div class="field"><label>CSV file</label><input class="input" type="file" id="csvFile" accept=".csv,text/csv" style="height:auto;padding:10px" /></div>
      <p class="muted" style="margin-top:10px">Columns: <span class="mono">${CSV_HEAD.join(", ")}</span>. Only <b>Name</b> is required. Tip: use “Export CSV”, edit in Sheets or Excel, and import new rows.</p>
      <div class="change-box hidden" id="csvPreview" style="margin-top:14px"></div>`,
    footer: `<button class="btn btn-outline left" id="csvTemplate">${icon("download")} Template</button><button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="csvGo" disabled>Import</button>`,
  });
  modal.$("[data-cancel]").onclick = () => modal.close();
  modal.$("#csvTemplate").onclick = () =>
    downloadFile("products-template.csv", toCsv([CSV_HEAD, ["EX-001", "", "Example item", "Pantry", "pc", "120", "85", "5", "24", "6", "yes", "🛒", ""]]), "text/csv;charset=utf-8");
  modal.$("#csvFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const box = modal.$("#csvPreview");
    if (!file) return;
    parsed = csvToProducts(await file.text());
    box.classList.remove("hidden");
    box.classList.toggle("short", !parsed.length);
    box.innerHTML = parsed.length ? `<span>Ready to import</span><b>${parsed.length} product${parsed.length > 1 ? "s" : ""}</b>` : `<span>No valid rows found — check the header row</span>`;
    modal.$("#csvGo").disabled = !parsed.length;
  });
  modal.$("#csvGo").onclick = async () => {
    const btn = modal.$("#csvGo");
    btn.disabled = true;
    btn.textContent = "Importing…";
    try {
      const res = await importProducts(parsed);
      toast(`Imported ${res.products.length} product${res.products.length === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} skipped (duplicate or invalid)` : ""}`);
      modal.close();
      if (onSaved) onSaved();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Import";
    }
  };
}

/* ------------------------------ page ------------------------------ */
export async function mount(el) {
  const F = { search: "", category: "all", status: "all" };
  let all = [];

  el.innerHTML = `
  <div class="view-enter">
    <div class="page-head">
      <div><h2>Inventory</h2><p>Track stock levels, prices and QR codes for every product.</p></div>
      <div class="actions">
        <button class="btn btn-outline" id="iImport">${icon("plus")} Import CSV</button>
        <button class="btn btn-outline" id="iExport">${icon("download")} Export CSV</button>
        <a class="btn btn-outline" href="#/labels">${icon("qr")} Print QR labels</a>
        <button class="btn btn-primary" id="iAdd">${icon("plus")} Add product</button>
      </div>
    </div>
    <div class="stat-grid" id="iStats"></div>
    <div class="card mt-16">
      <div class="toolbar">
        <div class="search-box"><span data-icon="search"></span><input class="input" id="iSearch" placeholder="Search by name, SKU or barcode…" /></div>
        <select class="select" id="iCat"></select>
        <select class="select" id="iStatus"><option value="all">All stock levels</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="inactive">Inactive</option></select>
        <div class="summary-line" id="iCount"></div>
      </div>
      <div class="table-wrap" style="max-height:calc(100vh - 380px);min-height:260px"><table class="table">
        <thead><tr><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th>Stock</th><th>Status</th><th></th></tr></thead>
        <tbody id="iBody"></tbody></table></div>
    </div>
  </div>`;
  hydrateIcons(el);

  const stats = () => {
    const active = all.filter((p) => p.isActive);
    const low = active.filter((p) => stockStatus(p) === "low").length;
    const out = active.filter((p) => stockStatus(p) === "out").length;
    const cost = active.reduce((s, p) => s + p.stock * p.cost, 0);
    const retail = active.reduce((s, p) => s + p.stock * p.price, 0);
    $("#iStats", el).innerHTML = `
      <div class="card stat"><div class="stat-top"><span class="stat-icon green">${icon("package", "lg")}</span>Active products</div><div class="stat-value">${active.length}</div><div class="stat-foot">${categoryCounts(active).length} categories</div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("layers", "lg")}</span>Stock value (cost)</div><div class="stat-value">${money(cost)}</div><div class="stat-foot">Retail value ${money(retail)}</div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon amber">${icon("alert", "lg")}</span>Low stock</div><div class="stat-value">${low}</div><div class="stat-foot">At or below reorder level</div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon red">${icon("box", "lg")}</span>Out of stock</div><div class="stat-value">${out}</div><div class="stat-foot">Unavailable at the POS</div></div>`;
  };

  const cats = () => {
    const sel = $("#iCat", el);
    sel.innerHTML = `<option value="all">All categories</option>` + categoryCounts(all).map(([c, n]) => `<option value="${esc(c)}" ${F.category === c ? "selected" : ""}>${esc(c)} (${n})</option>`).join("");
  };

  const filtered = () => {
    const q = F.search.toLowerCase();
    return all.filter((p) => {
      if (F.category !== "all" && p.category !== F.category) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q))) return false;
      if (F.status === "inactive") return !p.isActive;
      if (F.status !== "all") return p.isActive && stockStatus(p) === F.status;
      return true;
    });
  };

  function render() {
    const list = filtered();
    $("#iCount", el).innerHTML = `<span><b>${list.length}</b> of ${all.length} products</span>`;
    $("#iBody", el).innerHTML = list.length
      ? list
          .map((p) => {
            const st = stockStatus(p);
            const pct = Math.min(100, (p.stock / Math.max(p.reorderLevel * 3, 1)) * 100);
            const badge = !p.isActive
              ? '<span class="badge badge-gray">Inactive</span>'
              : st === "out" ? '<span class="badge badge-red">Out of stock</span>'
              : st === "low" ? '<span class="badge badge-amber">Low stock</span>'
              : '<span class="badge badge-green">In stock</span>';
            return `
        <tr data-id="${p.id}">
          <td><div class="cell-product"><span class="thumb" style="background:${catTint(p.category)}">${mediaHtml(p)}</span>
            <div><div class="name">${esc(p.name)}</div><div class="meta mono">${esc(p.sku)}${p.barcode ? " · " + esc(p.barcode) : ""}</div></div></div></td>
          <td>${esc(p.category)}</td>
          <td class="num"><b>${money(p.price)}</b><div class="muted" style="font-size:12px">/${esc(p.unit)}${p.taxRate ? ` · ${num(p.taxRate)}% ${esc(state.settings.taxLabel)}` : ""}</div></td>
          <td class="num muted">${money(p.cost)}</td>
          <td class="stock-cell"><div class="val">${num(p.stock)} <span class="muted" style="font-weight:600">${esc(p.unit)}</span></div><div class="meter ${st}"><i style="width:${pct}%"></i></div></td>
          <td>${badge}</td>
          <td><div class="row-actions">
            <button class="icon-btn primary" data-a="qr" title="QR code">${icon("qr")}</button>
            <button class="icon-btn primary" data-a="stock" title="Adjust stock">${icon("plusCircle")}</button>
            <button class="icon-btn" data-a="edit" title="Edit">${icon("edit")}</button>
            <button class="icon-btn danger" data-a="del" title="Delete">${icon("trash")}</button>
          </div></td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="7"><div class="empty"><div class="big">📦</div><h4>No products found</h4><p>Adjust your filters, add a product, or import a CSV.</p></div></td></tr>`;
  }

  function load() {
    all = state.all.slice();
    stats();
    cats();
    render();
  }

  $("#iBody", el).addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-a]");
    if (!btn) return;
    const p = all.find((x) => x.id === Number(btn.closest("tr").dataset.id));
    if (!p) return;
    const a = btn.dataset.a;
    if (a === "qr") openProductQR(p);
    else if (a === "stock") openStockModal(p, { onSaved: load });
    else if (a === "edit") openProductForm(p, { onSaved: load });
    else if (a === "del") {
      const ok = await confirmDialog({ title: `Delete ${p.name}?`, message: "This removes the product from your catalogue. Past invoices keep their line items. Consider marking it inactive instead.", confirmText: "Delete", danger: true });
      if (!ok) return;
      try {
        await deleteProduct(p.id);
        toast("Product deleted");
        load();
      } catch (err) {
        toast(err.message, "error");
      }
    }
  });
  $("#iSearch", el).addEventListener("input", debounce((e) => { F.search = e.target.value.trim(); render(); }, 150));
  $("#iCat", el).onchange = (e) => { F.category = e.target.value; render(); };
  $("#iStatus", el).onchange = (e) => { F.status = e.target.value; render(); };
  $("#iAdd", el).onclick = () => openProductForm(null, { onSaved: load });
  $("#iImport", el).onclick = () => openImportModal({ onSaved: load });
  $("#iExport", el).onclick = () => {
    downloadFile(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([CSV_HEAD, ...all.map(productCsvRow)]), "text/csv;charset=utf-8");
  };

  load();
}
