// Customer directory derived from the invoice history currently loaded by the POS.
// The page intentionally uses existing sales data first, so it works in This PC, offline-first,
// and Google Sheets modes without introducing a second customer database yet.
import { openInvoiceById } from "./sales.js";
import { HISTORY_DAYS, state } from "./store.js";
import { $, debounce, esc, fmtDateTime, icon, methodBadge, money, num, openModal } from "./ui.js";

let root = null;

function keyFor(s) {
  const phone = String(s.customerPhone || "").trim().toLowerCase();
  const name = String(s.customerName || "").trim().toLowerCase();
  return phone || name || "__walkin__";
}

function buildCustomers() {
  const map = new Map();
  for (const sale of state.sales) {
    const name = String(sale.customerName || "").trim();
    const phone = String(sale.customerPhone || "").trim();
    if (!name && !phone) continue;
    const key = keyFor(sale);
    let c = map.get(key);
    if (!c) {
      c = { key, name: name || "Customer", phone, invoices: 0, spend: 0, lastAt: sale.createdAt, sales: [] };
      map.set(key, c);
    }
    if (!c.name || c.name === "Customer") c.name = name || c.name;
    if (!c.phone) c.phone = phone;
    c.sales.push(sale);
    if (sale.status === "completed") {
      c.invoices += 1;
      c.spend += Number(sale.total) || 0;
    }
    if (new Date(sale.createdAt).getTime() > new Date(c.lastAt).getTime()) c.lastAt = sale.createdAt;
  }
  return [...map.values()].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

function showCustomer(c) {
  const modal = openModal({
    title: esc(c.name),
    sub: c.phone ? esc(c.phone) : "Customer profile",
    size: "lg",
    body: `
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Purchases</div><b style="font-size:22px">${num(c.invoices)}</b></div>
        <div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Recorded spend</div><b style="font-size:22px">${money(c.spend)}</b></div>
        <div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Average bill</div><b style="font-size:22px">${money(c.invoices ? c.spend / c.invoices : 0)}</b></div>
      </div>
      <div class="muted" style="margin:-4px 0 12px">Showing the invoices currently available to this POS (${HISTORY_DAYS} days).</div>
      <div class="table-wrap" style="max-height:52vh"><table class="table">
        <thead><tr><th>Invoice</th><th>Date</th><th>Payment</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>${c.sales.slice(0, 100).map((s) => `
          <tr class="clickable" data-invoice="${s.id}">
            <td><b class="mono">${esc(s.invoiceNo)}</b></td>
            <td class="nowrap">${esc(fmtDateTime(s.createdAt))}</td>
            <td>${methodBadge(s.paymentMethod)}</td>
            <td class="num"><b>${money(s.total)}</b></td>
            <td>${s.status === "voided" ? '<span class="badge badge-red">Voided</span>' : '<span class="badge badge-green">Paid</span>'}</td>
          </tr>`).join("") || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No invoices found.</td></tr>'}</tbody>
      </table></div>`,
    footer: `<button class="btn btn-outline" data-close>Close</button>`,
  });
  // openModal has a separate close button in the modal header; query the footer explicitly
  // so the visible "Close" action is wired to this modal as well.
  const footerClose = modal.foot?.querySelector("[data-close]");
  if (footerClose) footerClose.onclick = () => modal.close();
  modal.body.querySelectorAll("tr[data-invoice]").forEach((row) => {
    row.addEventListener("click", () => openInvoiceById(Number(row.dataset.invoice), { onChange: () => modal.close() }));
  });
}

export async function mount(el) {
  root = el;
  const F = { search: "" };
  el.innerHTML = `
    <div class="view-enter">
      <div class="page-head">
        <div><h2>Customers</h2><p>Customer directory built from the invoices currently loaded by this POS. A customer appears automatically when a name or phone is used at checkout.</p></div>
        <div class="actions"><button class="btn btn-outline" id="cExport">${icon("download")} Export CSV</button></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px" id="cStats"></div>
      <div class="card">
        <div class="toolbar">
          <div class="search-box"><span data-icon="search"></span><input class="input" id="cSearch" placeholder="Search customer name or phone…" /></div>
          <div class="summary-line" id="cSummary"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 320px)"><table class="table">
          <thead><tr><th>Customer</th><th>Phone</th><th class="num">Purchases</th><th class="num">Recorded spend</th><th>Last purchase</th><th></th></tr></thead>
          <tbody id="cBody"></tbody>
        </table></div>
      </div>
    </div>`;

  const render = () => {
    const all = buildCustomers();
    const q = F.search.toLowerCase();
    const list = all.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q));
    const spend = all.reduce((n, c) => n + c.spend, 0);
    $("#cStats", el).innerHTML = `
      <div class="card" style="padding:16px"><div class="muted">Customers</div><div style="font-size:28px;font-weight:800;margin-top:4px">${num(all.length)}</div><div class="muted" style="margin-top:4px">With a name or phone on a sale</div></div>
      <div class="card" style="padding:16px"><div class="muted">Recorded purchases</div><div style="font-size:28px;font-weight:800;margin-top:4px">${num(all.reduce((n, c) => n + c.invoices, 0))}</div><div class="muted" style="margin-top:4px">Completed invoices in the loaded history</div></div>
      <div class="card" style="padding:16px"><div class="muted">Customer revenue</div><div style="font-size:28px;font-weight:800;margin-top:4px">${money(spend)}</div><div class="muted" style="margin-top:4px">Recorded completed customer sales</div></div>`;
    $("#cSummary", el).innerHTML = `<span><b>${num(list.length)}</b> customers</span><span>Last ${HISTORY_DAYS} days</span>`;
    $("#cBody", el).innerHTML = list.length ? list.map((c) => `
      <tr class="clickable" data-customer="${esc(c.key)}">
        <td><b>${esc(c.name)}</b></td>
        <td>${c.phone ? `<span class="mono">${esc(c.phone)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num">${num(c.invoices)}</td>
        <td class="num"><b>${money(c.spend)}</b></td>
        <td class="nowrap">${esc(fmtDateTime(c.lastAt))}</td>
        <td><button class="btn btn-sm btn-soft" data-open>View</button></td>
      </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><div class="big">👤</div><h4>No customers found</h4><p>Enter a customer name or phone number while taking a sale.</p></div></td></tr>`;
  };

  $("#cSearch", el).addEventListener("input", debounce((e) => { F.search = e.target.value.trim(); render(); }, 150));
  $("#cBody", el).addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-customer]");
    if (!row) return;
    const c = buildCustomers().find((x) => x.key === row.dataset.customer);
    if (c) showCustomer(c);
  });
  $("#cExport", el).onclick = async () => {
    const { downloadFile } = await import("./ui.js");
    const { toCsv } = await import("./transfer.js");
    const rows = [["Customer", "Phone", "Purchases", "Recorded spend", "Last purchase"]].concat(
      buildCustomers().map((c) => [c.name, c.phone, c.invoices, c.spend.toFixed(2), new Date(c.lastAt).toLocaleString()]),
    );
    downloadFile(`customers-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };
  render();
}

export function refresh() {
  if (root) mount(root);
}

export function unmount() {
  root = null;
}
