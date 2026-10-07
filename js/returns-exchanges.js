// Returns & Exchanges — transactional return workflow linked to original invoices.
import { backend, getConfig } from "./data/backend.js";
import { idb } from "./data/idb.js";
import { refreshData, state } from "./store.js";
import { $, esc, icon, money, openModal, toast, hydrateIcons } from "./ui.js";

const KEY = "returns.v1";
let data = { returns: [], returnItems: [], lastPull: null };
let mountGeneration = 0;
const now = () => new Date().toISOString();

function ensureStyles() {
  if (document.querySelector('link[data-returns-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/returns.css";
  link.dataset.returnsCss = "1";
  document.head.appendChild(link);
}

async function saveLocal() { await idb.set(KEY, data); }

async function api(action, payload = {}) {
  const cfg = getConfig();
  if (cfg.mode === "local") throw new Error("Cloud API is unavailable in This PC only mode");
  if (!cfg.url) throw new Error("Connect Google Sheets in Settings first");
  if (!navigator.onLine) throw new Error("Returns & exchanges require an internet connection");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...(cfg.key ? { key: cfg.key } : {}), ...payload }), signal: ctrl.signal });
    const out = JSON.parse(await res.text());
    if (!out.ok) throw new Error(out.error || "Request failed");
    return out;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Google Sheets took too long to respond. Try again.");
    throw e.message ? e : new Error("Couldn't reach Google Sheets");
  } finally { clearTimeout(timer); }
}

// Navigation must never wait for Google Sheets. Load the local snapshot first; cloud refresh is background-only.
async function bootstrap() {
  const cached = await idb.get(KEY).catch(() => null);
  if (cached) data = { ...data, ...cached };
}

async function refreshCloud(generation, el, renderStats) {
  const cfg = getConfig();
  if (cfg.mode === "local" || !navigator.onLine) return;
  try {
    const r = await api("returnsBootstrap");
    if (generation !== mountGeneration || !el.isConnected || document.getElementById("view") !== el) return;
    data = { returns: r.returns || [], returnItems: r.returnItems || [], lastPull: now() };
    await saveLocal();
    if (generation === mountGeneration && el.isConnected && document.getElementById("view") === el) renderStats();
  } catch (e) {
    // Cached data remains usable. A background refresh failure must not block navigation or replace the page.
    if (generation === mountGeneration && el.isConnected && document.getElementById("view") === el) {
      console.warn("[FreshMart POS] returns background refresh failed:", e);
    }
  }
}

function findSaleByInvoice(invoiceNo) {
  const q = String(invoiceNo || "").trim().toLowerCase();
  return state.sales.find(s => String(s.invoiceNo).toLowerCase() === q) || null;
}
function itemsForSale(sale) { return sale ? (state.items.get(sale.id) || []) : []; }
function returnedQty(invoiceNo, saleItemId) { return data.returnItems.filter(x => String(x.invoiceNo).toLowerCase() === String(invoiceNo).toLowerCase() && Number(x.originalSaleItemId) === Number(saleItemId)).reduce((s,x) => s + Number(x.qty || 0), 0); }
function availableQty(sale,item) { return Math.max(0, Number(item.qty) - returnedQty(sale.invoiceNo,item.id)); }
function productById(id) { return state.all.find(p => Number(p.id) === Number(id)); }

function renderHistory(root) {
  const history = root.querySelector("#returnsHistory");
  if (!history) return;
  const rows = data.returns.slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  history.innerHTML = rows.length ? `<table class="table"><thead><tr><th>Return</th><th>Invoice</th><th>Date</th><th>Type</th><th>Items</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${rows.slice(0,200).map(r => `<tr class="clickable"><td><b class="mono">${esc(r.returnNo)}</b></td><td class="mono">${esc(r.invoiceNo)}</td><td>${esc(new Date(r.createdAt).toLocaleString())}</td><td>${r.type === "exchange" ? "Exchange" : "Return"}</td><td>${Number(r.itemCount || 0)}</td><td class="num"><b>${money(Math.abs(Number(r.refundAmount || r.difference || 0)))}</b></td><td><span class="badge badge-green">${esc(r.status || "Completed")}</span></td></tr>`).join("")}</tbody></table>` : `<div class="empty"><div class="big">${icon("undo")}</div><h4>No returns or exchanges yet</h4><p>Completed return transactions will appear here.</p></div>`;
}

function transactionModal(sale, ownerEl) {
  const original = itemsForSale(sale).filter(it => availableQty(sale,it) > 0);
  if (!original.length) return toast("All items on this invoice have already been returned", "warn");
  const products = state.all.filter(p => p.isActive);
  const m = openModal({
    title: `Return / exchange · ${sale.invoiceNo}`,
    sub: `${sale.customerName || "Walk-in"} · ${new Date(sale.createdAt).toLocaleString()}`,
    size: "lg",
    body: `<form id="returnForm"><div class="return-mode"><button type="button" class="active" data-mode="return">${icon("undo")} Return</button><button type="button" data-mode="exchange">${icon("refreshCw")} Exchange</button></div><div class="return-lines">${original.map(it => { const max=availableQty(sale,it); return `<div class="return-line" data-item="${it.id}"><div class="return-product"><b>${esc(it.name)}</b><small>${esc(it.sku)} · ${money(it.price)}/${esc(it.unit)} · sold ${it.qty}, available ${max}</small></div><input class="input" name="qty" type="number" min="0" max="${max}" step="0.001" value="0" aria-label="Return quantity"><select class="select replacement" name="replacement" disabled><option value="">Replacement product</option>${products.map(p => `<option value="${p.id}">${esc(p.name)} · ${money(p.price)}</option>`).join("")}</select><input class="input replacement-qty" name="replacementQty" type="number" min="0" step="0.001" value="0" disabled placeholder="Qty"></div>`; }).join("")}</div><div class="return-fields"><div class="field"><label>Reason</label><select class="select" id="returnReason"><option>Customer changed mind</option><option>Wrong item</option><option>Damaged / defective</option><option>Quality issue</option><option>Other</option></select></div><div class="field"><label>Settlement method</label><select class="select" id="settlement"><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI / QR</option></select></div></div><div class="return-total" id="returnTotal"></div></form>`,
    footer: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="returnSave">${icon("check")} Complete return</button>`,
  });
  hydrateIcons(m.$("#returnForm"));
  let mode="return";
  const form=m.$("#returnForm"), lines=[...form.querySelectorAll(".return-line")];
  lines.forEach(row => {
    const input = row.querySelector("[name=qty]");
    const item = original.find(x => Number(x.id) === Number(row.dataset.item));
    const max = item ? availableQty(sale, item) : 0;
    input.addEventListener("input", () => {
      let q = Number(input.value || 0);
      if (!Number.isFinite(q) || q < 0) q = 0;
      if (q > max) { q = max; input.value = String(max); toast(`Maximum returnable quantity is ${max}`, "warn"); }
      if (!/^(kg|l)$/i.test(item?.unit || "") && q % 1 !== 0) { q = Math.floor(q); input.value = String(q); }
      renderTotal();
    });
    input.addEventListener("blur", () => { let q=Number(input.value||0); if(q>max) q=max; if(q<0) q=0; if(!/^(kg|l)$/i.test(item?.unit||"")) q=Math.round(q); input.value=String(q); renderTotal(); });
  });
  const renderTotal=()=>{let returned=0,replacement=0;lines.forEach(row=>{const item=original.find(x=>Number(x.id)===Number(row.dataset.item));const q=Number(row.querySelector("[name=qty]").value||0);returned+=q*Number(item.price)*(1+Number(item.taxRate||0)/100);if(mode==="exchange"){const p=productById(row.querySelector("[name=replacement]").value);const rq=Number(row.querySelector("[name=replacementQty]").value||0);if(p)replacement+=rq*Number(p.price)*(1+Number(p.taxRate||0)/100);}});const diff=replacement-returned;m.$("#returnTotal").innerHTML=`<span>Returned value <b>${money(returned)}</b></span>${mode==="exchange"?`<span>Replacement value <b>${money(replacement)}</b></span>`:""}<strong>${diff>0?`Collect ${money(diff)}`:diff<0?`Refund ${money(Math.abs(diff))}`:"No balance due"}</strong>`;};
  form.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;form.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===b));lines.forEach(row=>{row.querySelector(".replacement").disabled=mode!=="exchange";row.querySelector(".replacement-qty").disabled=mode!=="exchange";});m.$("#returnSave").innerHTML=`${icon("check")} Complete ${mode}`;hydrateIcons(m.$("#returnSave"));renderTotal();});
  form.addEventListener("input",renderTotal); form.addEventListener("change",renderTotal);
  const cancel=m.$("[data-cancel]"), save=m.$("#returnSave");
  if (cancel) cancel.onclick=()=>m.close();
  if (save) save.onclick=async()=>{
    const selected=lines.map(row=>{const item=original.find(x=>Number(x.id)===Number(row.dataset.item));return {item,qty:Number(row.querySelector("[name=qty]").value||0),replacementId:Number(row.querySelector("[name=replacement]").value||0),replacementQty:Number(row.querySelector("[name=replacementQty]").value||0)};}).filter(x=>x.qty>0);
    if(!selected.length)return toast("Select at least one item and quantity","warn");
    if(mode==="exchange"&&selected.some(x=>!x.replacementId||x.replacementQty<=0))return toast("Select a replacement product and quantity for each exchanged item","warn");
    if(selected.some(x=>x.qty>availableQty(sale,x.item)))return toast("A return quantity exceeds the remaining returnable quantity","error");
    const payload={invoiceNo:sale.invoiceNo,type:mode,settlementMethod:m.$("#settlement").value,reason:m.$("#returnReason").value,items:selected.map(x=>{const p=x.replacementId?productById(x.replacementId):null;return {originalSaleItemId:x.item.id,productId:x.item.productId,sku:x.item.sku,name:x.item.name,unit:x.item.unit,qty:x.qty,unitPrice:Number(x.item.price),taxRate:Number(x.item.taxRate||0),replacementProductId:p?.id||0,replacementSku:p?.sku||"",replacementName:p?.name||"",replacementQty:x.replacementQty,replacementPrice:p?.price||0,replacementTaxRate:p?.taxRate||0};})};
    save.disabled=true;
    try{
      const returnedValue = payload.items.reduce((sum, x) => sum + x.qty * x.unitPrice * (1 + x.taxRate / 100), 0);
      const replacementValue = payload.items.reduce((sum, x) => sum + x.replacementQty * x.replacementPrice * (1 + x.replacementTaxRate / 100), 0);
      const refundValue = payload.type === "exchange" ? Math.max(0, returnedValue - replacementValue) : returnedValue;
      const minRole = requiredRoleForRefund(refundValue);
      if (minRole) await requestApproval({ action: payload.type === "exchange" ? "Exchange refund" : "Refund", minRole, detail: `${sale.invoiceNo} · refund ${money(refundValue)}` });
      let result;if(getConfig().mode==="local"){for(const x of payload.items){await backend.adjustStock({productId:x.productId,mode:"add",quantity:x.qty,reason:`${mode==="exchange"?"Exchange":"Return"} ${sale.invoiceNo}`});if(mode==="exchange")await backend.adjustStock({productId:x.replacementProductId,mode:"remove",quantity:x.replacementQty,reason:`Exchange ${sale.invoiceNo}`});}result=buildLocalRecord(payload,sale);}else{if(!navigator.onLine)throw new Error("Returns & exchanges require an internet connection so stock and the return record can be committed safely.");result=await api("returnsCreate",payload);}
      if(result.returnRecord)data.returns.unshift(result.returnRecord);if(result.returnItems)data.returnItems.push(...result.returnItems);await saveLocal();await refreshData().catch(()=>{});
      if (!ownerEl.isConnected || document.getElementById("view") !== ownerEl || mountGeneration === 0) { if (document.querySelector(".modal-backdrop")) m.close(); return; }
      toast(mode==="exchange"?"Exchange completed and stock updated":"Return completed and stock restored");m.close();mount(ownerEl);
    }catch(e){toast(e.message,"error");save.disabled=false;}
  };
  renderTotal();
}

function buildLocalRecord(payload,sale){const id=-Math.max(1,data.returns.filter(x=>Number(x.id)<0).length+1),createdAt=now(),returned=payload.items.reduce((s,x)=>s+x.qty*x.unitPrice*(1+x.taxRate/100),0),replacement=payload.items.reduce((s,x)=>s+x.replacementQty*x.replacementPrice*(1+x.replacementTaxRate/100),0),difference=payload.type==="exchange"?replacement-returned:-returned;const rec={id,returnNo:`RET-${createdAt.slice(0,10).replaceAll("-","")}-${String(Math.abs(id)).padStart(4,"0")}`,createdAt,invoiceNo:sale.invoiceNo,saleId:sale.id,customerName:sale.customerName||"",type:payload.type,settlementMethod:payload.settlementMethod,refundAmount:difference<0?Math.abs(difference):0,difference,status:"Completed",itemCount:payload.items.length,reason:payload.reason};const items=payload.items.map((x,i)=>({id:-(data.returnItems.filter(y=>Number(y.id)<0).length+i+1),returnId:id,invoiceNo:sale.invoiceNo,originalSaleItemId:x.originalSaleItemId,productId:x.productId,sku:x.sku,name:x.name,unit:x.unit,qty:x.qty,unitPrice:x.unitPrice,taxRate:x.taxRate,replacementProductId:x.replacementProductId,replacementSku:x.replacementSku,replacementName:x.replacementName,replacementQty:x.replacementQty,replacementPrice:x.replacementPrice,replacementTaxRate:x.replacementTaxRate,reason:payload.reason}));return{returnRecord:rec,returnItems:items};}

export async function mount(el){
  const generation = ++mountGeneration;
  ensureStyles();
  el.innerHTML=`<div class="view-enter returns-wrap"><div class="returns-actions"><button class="btn btn-primary" id="newReturn">${icon("undo")} New return / exchange</button></div><div class="returns-stats"><div><span>Returns & exchanges</span><b id="returnCount">0</b></div><div><span>Refund value</span><b id="refundValue">${money(0)}</b></div><div><span>Transactions</span><b id="transactionCount">0</b></div></div><div class="card"><div class="returns-find"><div class="search-box"><span data-icon="search"></span><input class="input" id="returnInvoice" placeholder="Enter or scan invoice number…"></div><button class="btn btn-outline" id="findInvoice">Find invoice</button></div><div id="invoiceResult"></div></div><div class="card"><div class="section-title"><div><h3>Recent returns & exchanges</h3><p>Completed return transactions for this POS.</p></div></div><div id="returnsHistory" class="table-wrap"></div></div></div>`;
  hydrateIcons(el);
  try { await bootstrap(); } catch(e) { if (generation !== mountGeneration || !el.isConnected || document.getElementById("view") !== el) return; console.warn("[FreshMart POS] returns cache read failed:", e); }
  if (generation !== mountGeneration || !el.isConnected || document.getElementById("view") !== el) return;
  const renderStats=()=>{const count=el.querySelector("#returnCount"),tx=el.querySelector("#transactionCount"),refund=el.querySelector("#refundValue");if(!count||!tx||!refund)return;count.textContent=data.returns.filter(r=>r.type==="return").length;tx.textContent=data.returns.length;refund.textContent=money(data.returns.reduce((s,r)=>s+Number(r.refundAmount||0),0));renderHistory(el);};
  const showInvoice=()=>{if(generation!==mountGeneration||!el.isConnected)return;const input=el.querySelector("#returnInvoice");if(!input)return;const no=input.value.trim(),sale=findSaleByInvoice(no);if(!sale)return toast("Invoice not found. Enter an invoice number from Invoices.","error");const items=itemsForSale(sale),result=el.querySelector("#invoiceResult");if(!result)return;result.innerHTML=`<div class="return-invoice"><div><b>${esc(sale.invoiceNo)}</b><span>${esc(sale.customerName||"Walk-in")} · ${new Date(sale.createdAt).toLocaleString()}</span></div><div><strong>${money(sale.total)}</strong><button class="btn btn-primary" id="startTransaction">${icon("undo")} Return / exchange</button></div></div><div class="return-invoice-items">${items.map(i=>`<div><span>${esc(i.name)} <small>× ${i.qty}</small></span><b>${money(Number(i.price)*Number(i.qty))}</b></div>`).join("")}</div>`;hydrateIcons(result);const start=result.querySelector("#startTransaction");if(start)start.onclick=()=>transactionModal(sale,el);};
  const findBtn=el.querySelector("#findInvoice"), invoiceInput=el.querySelector("#returnInvoice"), newBtn=el.querySelector("#newReturn");
  if(findBtn)findBtn.onclick=showInvoice;
  if(invoiceInput)invoiceInput.addEventListener("keydown",e=>{if(e.key==="Enter")showInvoice();});
  if(newBtn)newBtn.onclick=()=>{const input=el.querySelector("#returnInvoice");const v=input?input.value.trim():"";if(v)showInvoice();else{if(input)input.focus();toast("Enter the original invoice number first","warn");}};
  renderStats();
  // Refresh Google Sheets in the background after the cached page is already interactive.
  refreshCloud(generation, el, renderStats);
}

export function unmount(){ mountGeneration++; }
export function refresh(){const el=document.getElementById("view");if(el&&location.hash.includes("returns"))mount(el);}
