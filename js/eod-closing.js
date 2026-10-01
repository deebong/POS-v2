// End-of-Day Closing — local reconciliation report for sales, payments, returns and drawer sessions.
import { idb } from "./data/idb.js";
import { state } from "./store.js";
import { $, esc, hydrateIcons, icon, money, openModal, toast } from "./ui.js";

const CLOSING_KEY = "eod.closings.v1";
const DRAWER_KEY = "cash.drawer.v2";
const RETURNS_KEY = "returns.v1";
const LEGACY_DRAWER_KEY = "cash.drawer.v1";

let root = null;
let generation = 0;
let report = null;
let closingRecords = [];

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const round = (v) => Math.round(num(v) * 100) / 100;
const money0 = (v) => money(round(v));
const dayKey = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const parseDay = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const bounds = (key) => {
  const start = parseDay(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
};
const inDay = (iso, key) => {
  const t = new Date(iso).getTime();
  const b = bounds(key);
  return Number.isFinite(t) && t >= b.start && t < b.end;
};
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const methodLabel = (method) => method === "upi" ? "UPI / QR" : method === "card" ? "Card" : "Cash";

async function loadLocal() {
  const [saved, drawer, legacyDrawer, returns] = await Promise.all([
    idb.get(CLOSING_KEY).catch(() => null),
    idb.get(DRAWER_KEY).catch(() => null),
    idb.get(LEGACY_DRAWER_KEY).catch(() => null),
    idb.get(RETURNS_KEY).catch(() => null),
  ]);
  closingRecords = Array.isArray(saved?.records) ? saved.records : [];
  return {
    drawer: { active: null, sessions: [], movements: [], ...(drawer || legacyDrawer || {}) },
    returns: { returns: [], returnItems: [], ...(returns || {}) },
  };
}

function salesForDay(key) {
  return state.sales
    .filter((s) => inDay(s.createdAt, key) && s.status === "completed")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function returnsForDay(data, key) {
  return (data.returns.returns || [])
    .filter((r) => inDay(r.createdAt, key))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function drawerSessionsForDay(data, key) {
  const sessions = Array.isArray(data.drawer.sessions) ? data.drawer.sessions : [];
  const active = data.drawer.active ? [data.drawer.active] : [];
  return [...active, ...sessions]
    .filter((s) => inDay(s.openedAt, key))
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
}

function drawerExpected(session, movements, sales) {
  if (session.expectedCash != null) return round(session.expectedCash);
  const from = new Date(session.openedAt).getTime();
  const to = session.closedAt ? new Date(session.closedAt).getTime() : Date.now();
  const cashSales = sales
    .filter((s) => s.paymentMethod === "cash")
    .filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= from && t <= to;
    })
    .reduce((sum, s) => sum + num(s.total), 0);
  const moves = movements.filter((m) => m.sessionId === session.id);
  const cashIn = moves.filter((m) => m.type === "in").reduce((sum, m) => sum + num(m.amount), 0);
  const cashOut = moves.filter((m) => m.type === "out").reduce((sum, m) => sum + num(m.amount), 0);
  return round(num(session.openingFloat) + cashSales + cashIn - cashOut);
}

function buildReport(key, data) {
  const sales = salesForDay(key);
  const returns = returnsForDay(data, key);
  const gross = round(sales.reduce((sum, s) => sum + num(s.subtotal), 0));
  const discounts = round(sales.reduce((sum, s) => sum + num(s.discount), 0));
  const tax = round(sales.reduce((sum, s) => sum + num(s.tax), 0));
  const salesTotal = round(sales.reduce((sum, s) => sum + num(s.total), 0));
  const refunds = round(returns.reduce((sum, r) => sum + num(r.refundAmount), 0));
  const netSales = round(salesTotal - refunds);
  const payments = ["cash", "card", "upi"].map((method) => {
    const salesAmount = round(sales.filter((s) => s.paymentMethod === method).reduce((sum, s) => sum + num(s.total), 0));
    const refundAmount = round(returns.filter((r) => (r.settlementMethod || "cash") === method).reduce((sum, r) => sum + num(r.refundAmount), 0));
    return { method, sales: salesAmount, refunds: refundAmount, net: round(salesAmount - refundAmount) };
  });
  const drawerSessions = drawerSessionsForDay(data, key).map((s) => {
    const expectedCash = drawerExpected(s, data.drawer.movements || [], sales);
    const counted = s.countedCash == null ? null : round(s.countedCash);
    const variance = counted == null ? null : round(counted - expectedCash);
    return { ...s, expectedCash, countedCash: counted, variance };
  });
  return { key, sales, returns, gross, discounts, tax, salesTotal, refunds, netSales, payments, drawerSessions, transactionCount: sales.length, returnCount: returns.length };
}

function render() {
  if (!root || !root.isConnected || !report) return;
  const finalized = closingRecords.find((r) => r.day === report.key);
  root.innerHTML = `
    <div class="view-enter eod-page">
      <div class="eod-toolbar">
        <div class="eod-date"><label for="eodDate">Business date</label><input class="input" id="eodDate" type="date" value="${esc(report.key)}" /></div>
        <div class="actions"><button class="btn btn-outline" id="eodExport">${icon("download")} Export CSV</button><button class="btn btn-outline" id="eodPrint">${icon("printer")} Print summary</button>${finalized ? `<span class="badge badge-green eod-finalized">${icon("check", "sm")} Day finalized</span>` : `<button class="btn btn-primary" id="eodFinalize">${icon("check")} Finalize day</button>`}</div>
      </div>
      <div class="eod-stats">
        <div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("receipt", "lg")}</span>Net sales</div><div class="stat-value">${money0(report.netSales)}</div><div class="stat-foot">${report.transactionCount} completed transaction${report.transactionCount === 1 ? "" : "s"} · after refunds</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon green">${icon("dollar", "lg")}</span>Sales collected</div><div class="stat-value">${money0(report.salesTotal)}</div><div class="stat-foot">Gross billed value before refunds</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon violet">${icon("undo", "lg")}</span>Refunds</div><div class="stat-value">${money0(report.refunds)}</div><div class="stat-foot">${report.returnCount} return / exchange transaction${report.returnCount === 1 ? "" : "s"}</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon orange">${icon("calculator", "lg")}</span>Tax</div><div class="stat-value">${money0(report.tax)}</div><div class="stat-foot">Tax included in completed sales</div></div>
      </div>
      <div class="eod-grid">
        <section class="card"><div class="card-head"><div><h3>Payment reconciliation</h3><div class="sub">Collected and refunded by payment method</div></div></div><div class="card-body eod-payment-list">${report.payments.map((p) => `<div class="eod-payment-row"><div><b>${methodLabel(p.method)}</b><span>${money0(p.sales)} collected${p.refunds ? ` · ${money0(p.refunds)} refunded` : ""}</span></div><strong>${money0(p.net)}</strong></div>`).join("")}<div class="eod-total-row"><span>Net payment total</span><b>${money0(report.netSales)}</b></div></div></section>
        <section class="card"><div class="card-head"><div><h3>Sales reconciliation</h3><div class="sub">How the day's net sales were calculated</div></div></div><div class="card-body eod-breakdown"><div><span>Product subtotal</span><b>${money0(report.gross)}</b></div><div><span>Discounts</span><b class="negative">− ${money0(report.discounts)}</b></div><div><span>Tax</span><b>${money0(report.tax)}</b></div><div><span>Completed sales</span><b>${money0(report.salesTotal)}</b></div><div><span>Refunds</span><b class="negative">− ${money0(report.refunds)}</b></div><div class="total"><span>Net sales</span><b>${money0(report.netSales)}</b></div></div></section>
      </div>
      <section class="card mt-16"><div class="card-head"><div><h3>Drawer reconciliation</h3><div class="sub">Cash drawer sessions opened on ${esc(report.key)}</div></div></div><div class="table-wrap eod-table"><table class="table"><thead><tr><th>SESSION</th><th>OPENED</th><th>STATUS</th><th class="num">EXPECTED</th><th class="num">COUNTED</th><th class="num">VARIANCE</th></tr></thead><tbody>${report.drawerSessions.length ? report.drawerSessions.map((s) => `<tr><td><b class="mono">${esc(s.id)}</b><div class="muted">${esc(s.by || "Anand")} · ${esc(s.counter || "Counter 1")}</div></td><td>${fmtDate(s.openedAt)}${s.closedAt ? `<div class="muted">Closed ${fmtDate(s.closedAt)}</div>` : `<div class="muted">Currently open</div>`}</td><td>${s.closedAt ? '<span class="badge badge-green">Closed</span>' : '<span class="badge badge-blue">Open</span>'}</td><td class="num"><b>${money0(s.expectedCash)}</b></td><td class="num">${s.countedCash == null ? "—" : money0(s.countedCash)}</td><td class="num">${s.variance == null ? "—" : `<span class="eod-variance ${s.variance === 0 ? "zero" : s.variance > 0 ? "plus" : "minus"}">${s.variance > 0 ? "+" : ""}${money0(s.variance)}</span>`}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty"><div class="big">${icon("cash")}</div><h4>No drawer session for this date</h4><p>Open and close a drawer session to reconcile physical cash.</p></div></td></tr>`}</tbody></table></div></section>
      <section class="card mt-16"><div class="card-head"><div><h3>Completed sales</h3><div class="sub">${report.sales.length ? `Latest ${Math.min(report.sales.length, 50)} transactions for ${esc(report.key)}` : "No completed sales for this date"}</div></div></div><div class="table-wrap eod-table"><table class="table"><thead><tr><th>INVOICE</th><th>TIME</th><th>CUSTOMER</th><th>PAYMENT</th><th class="num">TOTAL</th></tr></thead><tbody>${report.sales.length ? report.sales.slice(0, 50).map((s) => `<tr><td><b class="mono">${esc(s.invoiceNo)}</b></td><td>${esc(fmtDate(s.createdAt))}</td><td>${esc(s.customerName || "Walk-in")}</td><td>${methodLabel(s.paymentMethod)}</td><td class="num"><b>${money0(s.total)}</b></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty"><p>No sales found for this date.</p></div></td></tr>`}</tbody></table></div></section>
    </div>`;
  hydrateIcons(root);
  bind();
}

function bind() {
  const date = $("#eodDate", root);
  date.onchange = () => loadReport(date.value);
  $("#eodExport", root).onclick = exportCsv;
  $("#eodPrint", root).onclick = printSummary;
  const finalize = $("#eodFinalize", root);
  if (finalize) finalize.onclick = finalizeDay;
}

async function loadReport(key) {
  const seq = ++generation;
  const data = await loadLocal();
  if (seq !== generation) return;
  report = buildReport(key || dayKey(), data);
  render();
}

async function finalizeDay() {
  if (!report) return;
  if (closingRecords.some((r) => r.day === report.key)) return toast("This business day is already finalized", "warn");
  const m = openModal({ title: `Finalize ${report.key}`, sub: "Save the end-of-day reconciliation on this PC", body: `<div class="eod-finalize-summary"><div><span>Net sales</span><b>${money0(report.netSales)}</b></div><div><span>Refunds</span><b>${money0(report.refunds)}</b></div><div><span>Transactions</span><b>${report.transactionCount}</b></div></div><div class="field" style="margin-top:16px"><label>Closing note <span class="muted">(optional)</span></label><textarea class="textarea" id="eodNote" rows="3" placeholder="e.g. Day checked and handed over to manager"></textarea></div>`, footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="eodFinalizeSave">${icon("check")} Finalize day</button>` });
  m.$("#eodFinalizeSave").onclick = async () => {
    const record = { id: `EOD-${report.key.replaceAll("-", "")}-${String(closingRecords.length + 1).padStart(4, "0")}`, day: report.key, finalizedAt: new Date().toISOString(), cashier: "Anand I", counter: "C1", netSales: report.netSales, salesTotal: report.salesTotal, refunds: report.refunds, transactionCount: report.transactionCount, note: m.$("#eodNote").value.trim() };
    closingRecords.unshift(record);
    closingRecords = closingRecords.slice(0, 90);
    await idb.set(CLOSING_KEY, { records: closingRecords });
    m.close(); render(); toast("End-of-day reconciliation finalized");
  };
}

function exportCsv() {
  if (!report) return;
  const rows = [["FreshMart End-of-Day Closing", report.key], [], ["Metric", "Value"], ["Net sales", report.netSales], ["Completed sales", report.salesTotal], ["Refunds", report.refunds], ["Transactions", report.transactionCount], ["Product subtotal", report.gross], ["Discounts", report.discounts], ["Tax", report.tax], [], ["Payment method", "Collected", "Refunded", "Net"], ...report.payments.map((p) => [methodLabel(p.method), p.sales, p.refunds, p.net]), [], ["Invoice", "Date", "Customer", "Payment", "Total"], ...report.sales.map((s) => [s.invoiceNo, new Date(s.createdAt).toLocaleString(), s.customerName || "Walk-in", methodLabel(s.paymentMethod), s.total])];
  const csv = rows.map((row) => row.map((v) => { const text = String(v ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `freshmart-eod-${report.key}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function printSummary() {
  if (!report) return;
  const html = `<div style="font-family:Arial,sans-serif;padding:28px;max-width:760px;margin:auto"><h1>FreshMart — End-of-Day Closing</h1><p>Business date: ${esc(report.key)}</p><hr><h2>Summary</h2><p>Net sales: <b>${money0(report.netSales)}</b></p><p>Completed sales: ${money0(report.salesTotal)}</p><p>Refunds: ${money0(report.refunds)}</p><p>Transactions: ${report.transactionCount}</p><h2>Payments</h2><table style="width:100%;border-collapse:collapse"><tr><th align="left">Method</th><th align="right">Collected</th><th align="right">Refunded</th><th align="right">Net</th></tr>${report.payments.map(p=>`<tr><td>${methodLabel(p.method)}</td><td align="right">${money0(p.sales)}</td><td align="right">${money0(p.refunds)}</td><td align="right">${money0(p.net)}</td></tr>`).join("")}</table><h2>Drawer reconciliation</h2><p>${report.drawerSessions.length ? report.drawerSessions.map(s=>`${esc(s.id)} — Expected ${money0(s.expectedCash)}, Counted ${s.countedCash == null ? "—" : money0(s.countedCash)}, Variance ${s.variance == null ? "—" : money0(s.variance)}`).join("<br>") : "No drawer session"}</p></div>`;
  const win = window.open("", "_blank");
  if (!win) return toast("Allow pop-ups to print the closing summary", "warn");
  win.document.write(`<!doctype html><html><head><title>FreshMart EOD ${esc(report.key)}</title></head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}

export async function mount(el) {
  root = el;
  const seq = ++generation;
  report = null;
  el.innerHTML = `<div class="view-enter eod-loading"><div class="big">${icon("calculator")}</div><h3>Preparing day close…</h3><p>Reading local sales, returns and drawer data.</p></div>`;
  try {
    const data = await loadLocal();
    if (seq !== generation || !el.isConnected || document.getElementById("view") !== el) return;
    report = buildReport(dayKey(), data);
    render();
  } catch (e) {
    if (seq !== generation || !el.isConnected || document.getElementById("view") !== el) return;
    el.innerHTML = `<div class="empty"><div class="big">⚠️</div><h4>Unable to prepare day close</h4><p>${esc(e.message || "Local data could not be read")}</p></div>`;
  }
}
export function refresh() { if (report) loadReport(report.key); }
export function unmount() { generation++; root = null; report = null; }
