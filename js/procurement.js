// Supplier + purchase management. Cache-first for fast navigation; Google Sheets refreshes in background.
import { idb } from "./data/idb.js";
import { getConfig, backend } from "./data/backend.js";
import { state } from "./store.js";
import { esc, icon, money, openModal, toast, hydrateIcons } from "./ui.js";

const KEY = "procurement.v1";
let data = { suppliers: [], purchases: [], purchaseItems: [], outbox: [], lastPull: null };
let mountGeneration = 0;
let activeRoot = null;
const now = () => new Date().toISOString();
const tempId = rows => -Math.max(1, rows.filter(x => Number(x.id) < 0).length + 1);

const api = async (action, payload = {}) => {
  const cfg = getConfig();
  if (cfg.mode === "local") return { ok: true, local: true };
  if (!cfg.url) throw new Error("Connect Google Sheets in Settings first");
  if (!navigator.onLine) throw new Error("You're offline; showing the last saved copy");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...(cfg.key ? { key: cfg.key } : {}), ...payload }), signal: ctrl.signal });
    const out = JSON.parse(await res.text());
    if (!out.ok) throw new Error(out.error || "Request failed");
    return out;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Google Sheets took too long to respond. Try again.");
    throw e.message ? e : new Error("Couldn't reach Google Sheets");
  } finally { clearTimeout(timer); }
};

async function saveLocal() { await idb.set(KEY, data); }
export async function getProcurementSnapshot() { await loadCache(); try { await refreshCloud(); } catch (_) {} return { suppliers: data.suppliers, purchases: data.purchases, purchaseItems: data.purchaseItems }; }
async function loadCache() { const cached = await idb.get(KEY).catch(() => null); if (cached) data = { ...data, ...cached }; return !!cached; }
async function refreshCloud() {
  const cfg = getConfig();
  if (cfg.mode === "local" || !navigator.onLine) return false;
  if (data.outbox.length) { await sync(); return true; }
  const r = await api("procurementBootstrap");
  data = { ...data, suppliers: r.suppliers || [], purchases: r.purchases || [], purchaseItems: r.purchaseItems || [], lastPull: now() };
  await saveLocal();
  return true;
}
async function sync() {
  if (getConfig().mode === "local" || !navigator.onLine || !data.outbox.length) return;
  const r = await api("procurementSync", { ops: data.outbox });
  const bad = new Set((r.results || []).filter(x => !x.ok).map(x => x.opId));
  data.outbox = data.outbox.filter(x => bad.has(x.opId));
  data.suppliers = r.suppliers || data.suppliers;
  data.purchases = r.purchases || data.purchases;
  data.purchaseItems = r.purchaseItems || data.purchaseItems;
  data.lastPull = now();
  await saveLocal();
  if (bad.size) throw new Error("Some procurement changes could not be synced");
}
function queue(type, payload) { data.outbox.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, payload }); }
function supplier(id) { return data.suppliers.find(s => Number(s.id) === Number(id)); }
function purchaseItems(purchaseId) { return data.purchaseItems.filter(x => Number(x.purchaseId) === Number(purchaseId)); }
function totals(lines) { const subtotal = lines.reduce((s,x) => s + Number(x.qty || 0) * Number(x.unitCost || 0), 0); const tax = lines.reduce((s,x) => s + Number(x.qty || 0) * Number(x.unitCost || 0) * Number(x.taxRate || 0) / 100, 0); return { subtotal, tax, total: subtotal + tax }; }
function mounted(root, generation) { return generation === mountGeneration && root?.isConnected && document.getElementById("view") === root; }

async function saveSupplier(s) {
  const existing = s.id ? supplier(s.id) : null;
  const row = { ...s, id: existing ? existing.id : tempId(data.suppliers), active: s.active !== false, createdAt: existing?.createdAt || now(), updatedAt: now() };
  if (existing) Object.assign(existing, row); else data.suppliers.unshift(row);
  queue("supplier.save", { supplier: row });
  await saveLocal();
  await sync();
}
async function deactivateSupplier(s) { s.active = false; s.updatedAt = now(); queue("supplier.delete", { id: s.id }); await saveLocal(); await sync(); }

function supplierModal(s, root, generation) {
  const editing = !!s;
  const p = s || { name: "", phone: "", email: "", address: "", gstin: "", notes: "", active: true };
  const m = openModal({ title: editing ? "Edit supplier" : "Add supplier", sub: "Supplier contact and billing details", size: "md", body: `<form id="supplierForm" class="form-grid"><div class="field span-2"><label>Supplier / company name *</label><input class="input" name="name" required maxlength="120" value="${esc(p.name)}" placeholder="e.g. Sri Lakshmi Distributors"></div><div class="field"><label>Phone</label><input class="input" name="phone" maxlength="40" value="${esc(p.phone || "")}"></div><div class="field"><label>Email</label><input class="input" name="email" type="email" maxlength="120" value="${esc(p.email || "")}"></div><div class="field"><label>GSTIN</label><input class="input" name="gstin" maxlength="40" value="${esc(p.gstin || "")}"></div><div class="field span-2"><label>Address</label><textarea class="input" name="address" rows="2" maxlength="300">${esc(p.address || "")}</textarea></div><div class="field span-2"><label>Notes</label><textarea class="input" name="notes" rows="2" maxlength="300">${esc(p.notes || "")}</textarea></div></form>`, footer: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="supplierSave">${icon("check")} Save supplier</button>` });
  const f = m.$("#supplierForm"), cancel = m.$("[data-cancel]"), save = m.$("#supplierSave");
  if (cancel) cancel.onclick = () => m.close();
  if (save) save.onclick = async () => {
    if (!f.reportValidity()) return;
    const values = Object.fromEntries(new FormData(f));
    try { await saveSupplier({ ...p, ...values }); toast("Supplier saved"); m.close(); if (mounted(root, generation)) render(root, generation); }
    catch (e) { toast(e.message, "error"); }
  };
}

async function savePurchase(purchase, lines) {
  const t = totals(lines), localId = tempId(data.purchases), s = supplier(purchase.supplierId);
  const row = { id: localId, purchaseNo: `PUR-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(Math.abs(localId)).padStart(4,"0")}`, supplierId: Number(purchase.supplierId) || 0, supplierName: s?.name || "", invoiceNo: purchase.invoiceNo || "", createdAt: now(), receivedAt: now(), status: "received", ...t, notes: purchase.notes || "" };
  data.purchases.unshift(row);
  const items = lines.map((x,i) => ({ id: -(data.purchaseItems.filter(z => z.id < 0).length + i + 1), purchaseId: localId, productId: Number(x.productId), sku: x.sku, name: x.name, unit: x.unit, qty: Number(x.qty), unitCost: Number(x.unitCost), taxRate: Number(x.taxRate) || 0, lineSubtotal: Number(x.qty) * Number(x.unitCost), lineTax: Number(x.qty) * Number(x.unitCost) * (Number(x.taxRate) || 0) / 100 }));
  data.purchaseItems.push(...items); queue("purchase.save", { purchase: row, items }); await saveLocal();
  for (const x of items) { await backend.adjustStock({ productId: x.productId, mode: "add", quantity: x.qty, reason: `Supplier delivery ${row.purchaseNo}` }); const p = state.all.find(z => Number(z.id) === Number(x.productId)); if (p) { p.cost = Number(x.unitCost); await backend.saveProduct({ product: { ...p, cost: Number(x.unitCost), stock: p.stock } }); } }
  await sync();
}

function purchaseModal(root, generation) {
  if (!data.suppliers.some(s => s.active)) return toast("Add a supplier before recording a purchase", "warn");
  const products = state.all.filter(p => p.isActive);
  const m = openModal({ title: "Receive supplier purchase", sub: "Stock is increased immediately when this purchase is saved", size: "lg", body: `<form id="purchaseForm"><div class="proc-grid"><div class="field"><label>Supplier *</label><select class="select" name="supplierId" required><option value="">Select supplier</option>${data.suppliers.filter(s=>s.active).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div><div class="field"><label>Supplier invoice no.</label><input class="input" name="invoiceNo"></div><div class="field"><label>Notes</label><input class="input" name="notes"></div></div><div class="proc-lines" id="procLines"><div class="proc-empty">Add products to this purchase.</div></div><button type="button" class="btn btn-outline" id="addPurchaseLine">${icon("plus")} Add product</button><div class="proc-total" id="procTotal"></div></form>`, footer: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="purchaseSave">${icon("check")} Receive purchase</button>` });
  const f = m.$("#purchaseForm"), lines = m.$("#procLines");
  const renderLines = () => { const rows = [...lines.querySelectorAll(".proc-line")]; m.$("#procTotal").innerHTML = rows.length ? `<b>Total</b> ${money(rows.reduce((s,r)=>s+Number(r.querySelector('[name=qty]').value||0)*Number(r.querySelector('[name=unitCost]').value||0),0))}` : ""; };
  const add = () => { if (lines.querySelector(".proc-empty")) lines.innerHTML = ""; const r = document.createElement("div"); r.className = "proc-line"; r.innerHTML = `<select class="select" name="product"><option value="">Product</option>${products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(p.sku)}</option>`).join("")}</select><input class="input" name="qty" type="number" min="0.001" step="0.001" placeholder="Qty"><input class="input" name="unitCost" type="number" min="0" step="0.01" placeholder="Cost"><input class="input" name="taxRate" type="number" min="0" step="0.01" value="0" placeholder="Tax %"><button type="button" class="icon-btn" data-remove title="Remove">${icon("trash")}</button>`; lines.appendChild(r); hydrateIcons(r); r.querySelector("[data-remove]").onclick=()=>{r.remove();renderLines();}; r.querySelectorAll("input").forEach(x=>x.oninput=renderLines); renderLines(); };
  m.$("[data-cancel]").onclick = () => m.close(); m.$("#addPurchaseLine").onclick = add; add();
  m.$("#purchaseSave").onclick = async () => { const ls=[...lines.querySelectorAll(".proc-line")].map(r=>{const p=products.find(x=>x.id===Number(r.querySelector('[name=product]').value));return p?{productId:p.id,sku:p.sku,name:p.name,unit:p.unit,qty:Number(r.querySelector('[name=qty]').value),unitCost:Number(r.querySelector('[name=unitCost]').value),taxRate:Number(r.querySelector('[name=taxRate]').value||0)}:null;}).filter(Boolean); if(!f.reportValidity()||!ls.length||ls.some(x=>x.qty<=0||x.unitCost<0))return toast("Select products and enter valid quantities/costs","error"); try{await savePurchase(Object.fromEntries(new FormData(f)),ls);toast("Purchase received and stock updated");m.close();if(mounted(root,generation))render(root,generation);}catch(e){toast(e.message,"error");} };
}

function render(root = activeRoot, generation = mountGeneration) {
  if (!mounted(root, generation)) return;
  const totalPurchases = data.purchases.reduce((s,p)=>s+Number(p.total||0),0);
  root.innerHTML = `<div class="proc-wrap"><div class="proc-head"><div><p class="proc-kicker">Manage suppliers and incoming stock.</p></div><div class="btn-row"><button class="btn btn-outline" id="addSupplier">${icon("plus")} Add supplier</button><button class="btn btn-primary" id="addPurchase">${icon("package")} Receive purchase</button></div></div><div class="proc-stats"><div><span>Active suppliers</span><b>${data.suppliers.filter(s=>s.active).length}</b></div><div><span>Received purchases</span><b>${data.purchases.length}</b></div><div><span>Recorded purchase value</span><b>${money(totalPurchases)}</b></div></div><div class="proc-tabs"><button class="active" data-tab="suppliers">Suppliers</button><button data-tab="purchases">Purchase history</button></div><section id="supplierTab"><div class="proc-card"><div class="proc-search"><input class="input" id="supplierSearch" placeholder="Search supplier, phone or GSTIN…"></div><div class="proc-table" id="supplierTable"></div></div></section><section id="purchaseTab" class="hidden"><div class="proc-card"><div class="proc-search"><input class="input" id="purchaseSearch" placeholder="Search purchase no., supplier or invoice…"></div><div class="proc-table" id="purchaseTable"></div></div></section></div>`;
  hydrateIcons(root);
  root.querySelector("#addSupplier").onclick = () => supplierModal(null, root, generation);
  root.querySelector("#addPurchase").onclick = () => purchaseModal(root, generation);
  const renderSup = () => { const q=root.querySelector("#supplierSearch")?.value.toLowerCase()||"", box=root.querySelector("#supplierTable"); if(!box)return; const rows=data.suppliers.filter(s=>s.active&&(`${s.name} ${s.phone} ${s.gstin}`).toLowerCase().includes(q)); box.innerHTML=rows.length?`<table><thead><tr><th>Supplier</th><th>Phone</th><th>GSTIN</th><th>Purchases</th><th>Recorded value</th><th></th></tr></thead><tbody>${rows.map(s=>{const ps=data.purchases.filter(p=>Number(p.supplierId)===Number(s.id));return `<tr><td><b>${esc(s.name)}</b><small>${esc(s.email||s.address||"")}</small></td><td>${esc(s.phone||"—")}</td><td>${esc(s.gstin||"—")}</td><td>${ps.length}</td><td>${money(ps.reduce((a,p)=>a+Number(p.total||0),0))}</td><td><button class="btn btn-sm btn-outline" data-edit="${s.id}">Edit</button> <button class="btn btn-sm btn-ghost" data-deactivate="${s.id}">Deactivate</button></td></tr>`}).join("")}</tbody></table>`:`<div class="proc-empty">No suppliers found.</div>`;box.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>supplierModal(supplier(b.dataset.edit),root,generation));box.querySelectorAll("[data-deactivate]").forEach(b=>b.onclick=async()=>{const s=supplier(b.dataset.deactivate);if(!s)return;if(confirm(`Deactivate ${s.name}?`)){try{await deactivateSupplier(s);if(mounted(root,generation))render(root,generation);}catch(e){toast(e.message,"error");}}}); };
  const renderPur = () => { const q=root.querySelector("#purchaseSearch")?.value.toLowerCase()||"",box=root.querySelector("#purchaseTable"); if(!box)return; const rows=data.purchases.filter(p=>`${p.purchaseNo} ${p.supplierName} ${p.invoiceNo}`.toLowerCase().includes(q));box.innerHTML=rows.length?`<table><thead><tr><th>Purchase</th><th>Supplier</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.purchaseNo)}</b><small>${esc(p.invoiceNo||"")}</small></td><td>${esc(p.supplierName||"—")}</td><td>${new Date(p.receivedAt||p.createdAt).toLocaleString()}</td><td>${purchaseItems(p.id).reduce((s,x)=>s+Number(x.qty||0),0)}</td><td><b>${money(p.total)}</b></td><td><span class="proc-status">● Received</span></td></tr>`).join("")}</tbody></table>`:`<div class="proc-empty">No purchases found.</div>`; };
  root.querySelector("#supplierSearch").oninput=renderSup;root.querySelector("#purchaseSearch").oninput=renderPur;root.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{root.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));root.querySelector("#supplierTab").classList.toggle("hidden",b.dataset.tab!=="suppliers");root.querySelector("#purchaseTab").classList.toggle("hidden",b.dataset.tab!=="purchases");});
  renderSup(); renderPur();
}

const STYLE=`.proc-wrap{padding:28px 34px}.proc-head{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:4px}.proc-kicker{margin:0;color:var(--muted);font-size:16px}.proc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0}.proc-stats>div,.proc-card{background:var(--card,#fff);border:1px solid var(--border,#e4e8ef);border-radius:16px}.proc-stats>div{padding:18px 20px}.proc-stats span{display:block;color:var(--muted);font-size:13px}.proc-stats b{display:block;font-size:23px;margin-top:7px}.proc-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:16px}.proc-tabs button{border:0;background:transparent;padding:11px 16px;color:var(--muted);font-weight:700;cursor:pointer;border-bottom:2px solid transparent}.proc-tabs button.active{color:var(--primary);border-color:var(--primary)}.proc-card{overflow:hidden}.proc-search{padding:16px;border-bottom:1px solid var(--border)}.proc-table{overflow:auto}.proc-table table{width:100%;border-collapse:collapse}.proc-table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:left;background:var(--surface,#f8fafc);padding:12px 16px}.proc-table td{padding:14px 16px;border-top:1px solid var(--border);vertical-align:middle}.proc-table small{display:block;color:var(--muted);margin-top:3px}.proc-status{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eaf8ef;color:#15803d;font-weight:700;font-size:12px}.proc-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}.proc-grid .field:last-child{grid-column:1/-1}.proc-lines{display:grid;gap:8px;margin:12px 0}.proc-line{display:grid;grid-template-columns:2.2fr .8fr .9fr .7fr 42px;gap:8px;align-items:center}.proc-empty{padding:30px;text-align:center;color:var(--muted)}.proc-total{display:flex;justify-content:flex-end;gap:8px;padding:14px 0;font-size:16px}@media(max-width:850px){.proc-wrap{padding:20px}.proc-head{flex-direction:column;align-items:stretch}.proc-stats{grid-template-columns:1fr}.proc-line{grid-template-columns:1fr 1fr}.proc-line select{grid-column:1/-1}.proc-grid{grid-template-columns:1fr}}`;
function injectStyle(){if(document.getElementById("proc-style"))return;const s=document.createElement("style");s.id="proc-style";s.textContent=STYLE;document.head.appendChild(s);}

export async function mount(root) {
  const generation = ++mountGeneration;
  activeRoot = root;
  injectStyle();
  await loadCache();
  if (!mounted(root,generation)) return;
  render(root,generation);
  const hasCache = data.suppliers.length || data.purchases.length || data.purchaseItems.length || data.lastPull;
  const cfg = getConfig();
  if (cfg.mode !== "local" && navigator.onLine) {
    refreshCloud().then(changed => { if(changed && mounted(root,generation)) render(root,generation); }).catch(e => { if(!hasCache && mounted(root,generation)){root.innerHTML=`<div class="empty"><div class="big">⚠️</div><h4>Supplier data couldn't load</h4><p>${esc(e.message)}</p><button class="btn btn-primary" id="procRetry">Retry</button></div>`;const b=root.querySelector("#procRetry");if(b)b.onclick=()=>mount(root);} else if(mounted(root,generation)){toast("Supplier data is offline; showing the last saved copy","warn");} });
  }
}
export function unmount(){ mountGeneration++; activeRoot=null; }
export function refresh(){ const root=document.getElementById("view"); if(root&&location.hash.includes("procurement")) mount(root); }
