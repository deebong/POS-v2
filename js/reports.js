import { state, isWeighed } from "./store.js";
import { idb } from "./data/idb.js";
import { $, esc, hydrateIcons, icon, money, toast } from "./ui.js";

const RETURNS_KEY = "returns.v1";
let root = null;
let returns = [];
let range = { from: "", to: "" };
const pad = n => String(n).padStart(2, "0");
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; };
const today = () => dayKey(new Date());
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate()+n); return dayKey(d); };
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const r2 = v => Math.round(num(v)*100)/100;
const money0 = v => money(r2(v));
const methodLabel = m => m === "upi" ? "UPI / QR" : m === "card" ? "Card" : "Cash";
const fmtDay = k => new Date(`${k}T12:00:00`).toLocaleDateString(undefined,{day:"numeric",month:"short"});
const inRange = (iso, from, to) => { const k=dayKey(iso); return k>=from && k<=to; };

async function loadReturns(){ try { const d=await idb.get(RETURNS_KEY); returns=Array.isArray(d?.returns)?d.returns:[]; } catch(_){ returns=[]; } }
function defaultRange(){ return {from:addDays(today(),-6),to:today()}; }
function collect(){
  const sales=state.sales.filter(s=>s.status==="completed"&&inRange(s.createdAt,range.from,range.to));
  const refunds=returns.filter(r=>inRange(r.createdAt,range.from,range.to));
  const gross=r2(sales.reduce((a,s)=>a+num(s.subtotal),0));
  const discounts=r2(sales.reduce((a,s)=>a+num(s.discount),0));
  const tax=r2(sales.reduce((a,s)=>a+num(s.tax),0));
  const salesTotal=r2(sales.reduce((a,s)=>a+num(s.total),0));
  const refundTotal=r2(refunds.reduce((a,r)=>a+num(r.refundAmount),0));
  const payments=["cash","card","upi"].map(method=>({method,total:r2(sales.filter(s=>s.paymentMethod===method).reduce((a,s)=>a+num(s.total),0)),count:sales.filter(s=>s.paymentMethod===method).length}));
  const products=new Map();
  for(const sale of sales) for(const item of state.items.get(sale.id)||[]){ const key=item.productId||item.sku||item.name; const p=products.get(key)||{name:item.name,emoji:item.emoji||"",qty:0,revenue:0}; p.qty+=isWeighed(item.unit)?1:num(item.qty); p.revenue+=num(item.lineSubtotal); products.set(key,p); }
  const topProducts=[...products.values()].map(p=>({...p,qty:r2(p.qty),revenue:r2(p.revenue)})).sort((a,b)=>b.revenue-a.revenue).slice(0,8);
  const days=[]; for(let k=range.from;k<=range.to;k=addDays(k,1)){ const ds=sales.filter(s=>dayKey(s.createdAt)===k); days.push({key:k,revenue:r2(ds.reduce((a,s)=>a+num(s.total),0)),count:ds.length}); }
  const peak=days.reduce((best,d)=>d.revenue>best.revenue?d:best,{key:range.from,revenue:0,count:0});
  return {sales,refunds,gross,discounts,tax,salesTotal,refundTotal,net:r2(salesTotal-refundTotal),payments,topProducts,days,peak};
}
function render(){
  if(!root)return; const d=collect(); const maxDay=Math.max(1,...d.days.map(x=>x.revenue)); const maxProduct=Math.max(1,...d.topProducts.map(x=>x.revenue));
  root.innerHTML=`<div class="reports-page view-enter">
    <div class="reports-toolbar"><div class="reports-range"><label>From <input class="input" id="reportFrom" type="date" value="${esc(range.from)}"></label><span>—</span><label>To <input class="input" id="reportTo" type="date" value="${esc(range.to)}"></label><button class="btn btn-outline" id="reportApply">Apply</button></div><button class="btn btn-outline" id="reportExport">${icon("download")} Export CSV</button></div>
    <div class="reports-stats"><div class="card stat"><div class="stat-top">Net sales</div><div class="stat-value">${money0(d.net)}</div><div class="stat-foot">${d.sales.length} completed sale${d.sales.length===1?"":"s"} after refunds</div></div><div class="card stat"><div class="stat-top">Average bill</div><div class="stat-value">${money0(d.sales.length?d.salesTotal/d.sales.length:0)}</div><div class="stat-foot">${money0(d.salesTotal)} billed</div></div><div class="card stat"><div class="stat-top">Refunds</div><div class="stat-value">${money0(d.refundTotal)}</div><div class="stat-foot">${d.refunds.length} return transaction${d.refunds.length===1?"":"s"}</div></div><div class="card stat"><div class="stat-top">Peak day</div><div class="stat-value">${money0(d.peak.revenue)}</div><div class="stat-foot">${fmtDay(d.peak.key)} · ${d.peak.count} sale${d.peak.count===1?"":"s"}</div></div></div>
    <div class="reports-grid"><section class="card reports-card"><div class="card-head"><div><h3>Sales by day</h3><div class="sub">Completed sales for the selected period</div></div></div><div class="card-body reports-bars">${d.days.map(x=>`<div class="report-bar-row"><span>${esc(fmtDay(x.key))}</span><div class="report-bar-track"><div class="report-bar" style="width:${Math.round(x.revenue/maxDay*100)}%"></div></div><b>${money0(x.revenue)}</b></div>`).join("")}</div></section><section class="card reports-card"><div class="card-head"><div><h3>Payment methods</h3><div class="sub">Sales collected by tender type</div></div></div><div class="card-body reports-payments">${d.payments.map(p=>`<div class="report-payment"><div><b>${methodLabel(p.method)}</b><span>${p.count} sale${p.count===1?"":"s"}</span></div><strong>${money0(p.total)}</strong></div>`).join("")}<div class="report-payment total"><b>Total billed</b><strong>${money0(d.salesTotal)}</strong></div></div></section></div>
    <div class="reports-grid"><section class="card reports-card"><div class="card-head"><div><h3>Top products</h3><div class="sub">Highest sales value in the selected period</div></div></div><div class="card-body reports-products">${d.topProducts.length?d.topProducts.map(p=>`<div class="report-product"><div class="report-product-name"><span>${esc(p.emoji)}</span><b>${esc(p.name)}</b><small>${p.qty} sold</small></div><div class="report-product-value"><div class="report-bar-track"><div class="report-bar" style="width:${Math.max(4,Math.round(p.revenue/maxProduct*100))}%"></div></div><strong>${money0(p.revenue)}</strong></div></div>`).join(""):"<div class=\"empty\"><p>No product sales in this period.</p></div>"}</div></section><section class="card reports-card"><div class="card-head"><div><h3>Sales summary</h3><div class="sub">Reconciliation for the selected period</div></div></div><div class="card-body reports-breakdown"><div><span>Product subtotal</span><b>${money0(d.gross)}</b></div><div><span>Discounts</span><b>− ${money0(d.discounts)}</b></div><div><span>Tax</span><b>${money0(d.tax)}</b></div><div><span>Completed sales</span><b>${money0(d.salesTotal)}</b></div><div><span>Refunds</span><b>− ${money0(d.refundTotal)}</b></div><div class="total"><span>Net sales</span><b>${money0(d.net)}</b></div></div></section></div>
  </div>`;
  hydrateIcons(root); bind(d);
}
function bind(data){
  $("#reportApply",root).onclick=()=>{ const from=$("#reportFrom",root).value,to=$("#reportTo",root).value; if(!from||!to||from>to)return toast("Choose a valid report date range","warn"); range={from,to}; render(); };
  $("#reportExport",root).onclick=()=>exportCsv(data);
}
function exportCsv(d){
  const rows=[["FreshMart Sales Report",`${range.from} to ${range.to}`],[],["Metric","Value"],["Net sales",d.net],["Completed sales",d.salesTotal],["Refunds",d.refundTotal],["Discounts",d.discounts],["Tax",d.tax],["Transactions",d.sales.length],[],["Payment method","Sales","Transactions"],...d.payments.map(p=>[methodLabel(p.method),p.total,p.count]),[],["Date","Sales","Transactions"],...d.days.map(x=>[x.key,x.revenue,x.count]),[],["Product","Quantity","Sales value"],...d.topProducts.map(p=>[p.name,p.qty,p.revenue])];
  const csv="\uFEFF"+rows.map(row=>row.map(v=>{const s=String(v??"");return /[\",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a"); a.href=url; a.download=`freshmart-report-${range.from}-to-${range.to}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast("Report exported");
}
export async function mount(el){root=el;range=defaultRange();root.innerHTML=`<div class="reports-loading"><div class="big">${icon("calculator")}</div><p>Preparing report…</p></div>`;await loadReturns();render();}
export function refresh(){render();}
export function unmount(){root=null;}
