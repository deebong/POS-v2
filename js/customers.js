// Customer directory + persistent customer profiles.
// Profiles are stored in the active backend (Google Sheets in live/hybrid modes) and remain usable offline.
import { openInvoiceById } from "./sales.js";
import { HISTORY_DAYS, state, saveCustomer } from "./store.js";
import { $, debounce, esc, fmtDateTime, icon, methodBadge, money, num, openModal, toast } from "./ui.js";

let root = null;

function keyForSale(s) {
  const phone = String(s.customerPhone || "").trim().toLowerCase();
  const name = String(s.customerName || "").trim().toLowerCase();
  return phone || name || "__walkin__";
}
function profileKey(c) {
  const phone = String(c.phone || "").trim().toLowerCase();
  const name = String(c.name || "").trim().toLowerCase();
  return phone || name || String(c.id || "");
}
function buildCustomers() {
  const map = new Map();
  for (const p of state.customers || []) {
    if (p.active === false) continue;
    map.set(profileKey(p), { ...p, invoices: 0, spend: 0, lastAt: p.updatedAt || p.createdAt || null, sales: [] });
  }
  for (const sale of state.sales) {
    const name = String(sale.customerName || "").trim();
    const phone = String(sale.customerPhone || "").trim();
    if (!name && !phone) continue;
    const k = keyForSale(sale);
    let c = map.get(k);
    if (!c) {
      c = { id: "", key: k, name: name || "Customer", phone, email: "", address: sale.customerAddress || "", notes: "", invoices: 0, spend: 0, lastAt: sale.createdAt, sales: [] };
      map.set(k, c);
    }
    if (!c.name || c.name === "Customer") c.name = name || c.name;
    if (!c.phone) c.phone = phone;
    if (!c.address) c.address = sale.customerAddress || "";
    c.sales.push(sale);
    if (sale.status === "completed") { c.invoices += 1; c.spend += Number(sale.total) || 0; }
    if (!c.lastAt || new Date(sale.createdAt).getTime() > new Date(c.lastAt).getTime()) c.lastAt = sale.createdAt;
  }
  return [...map.values()].sort((a,b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
}

function editCustomer(existing = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: existing.id ? "Edit customer" : "Add customer",
      sub: existing.id ? existing.name : "Save a customer profile for future invoices.",
      size: "md",
      body: `
        <div class="form-grid">
          <div class="field"><label>Name</label><input class="input" id="custName" maxlength="100" value="${esc(existing.name || "")}" placeholder="Customer name"></div>
          <div class="field"><label>Phone</label><input class="input" id="custPhone" maxlength="30" inputmode="tel" value="${esc(existing.phone || "")}" placeholder="Phone number"></div>
          <div class="field"><label>Email</label><input class="input" id="custEmail" maxlength="160" type="email" value="${esc(existing.email || "")}" placeholder="Email address"></div>
          <div class="field" style="grid-column:1/-1"><label>Address</label><textarea class="input" id="custAddress" maxlength="500" rows="3" placeholder="Full delivery / billing address">${esc(existing.address || "")}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea class="input" id="custNotes" maxlength="500" rows="2" placeholder="Optional notes">${esc(existing.notes || "")}</textarea></div>
        </div>
        <div class="staff-pin-error" id="custError"></div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="custSave">${icon("check")} Save customer</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    m.$("#custSave").onclick = async () => {
      const b = m.$("#custSave"), err = m.$("#custError");
      const customer = {
        id: existing.id || "",
        name: m.$("#custName").value.trim(),
        phone: m.$("#custPhone").value.trim(),
        email: m.$("#custEmail").value.trim(),
        address: m.$("#custAddress").value.trim(),
        notes: m.$("#custNotes").value.trim(),
        active: true,
      };
      if (!customer.name && !customer.phone && !customer.email) { err.textContent = "Enter at least a name, phone number or email."; return; }
      b.disabled = true; err.textContent = "";
      try {
        const saved = await saveCustomer(customer);
        done = true; m.close(); toast("Customer profile saved."); resolve(saved);
      } catch (e) {
        err.textContent = e.message || "Could not save customer.";
        b.disabled = false;
      }
    };
  });
}

function showCustomer(c) {
  const modal = openModal({
    title: esc(c.name || "Customer"),
    sub: c.phone ? esc(c.phone) : "Customer profile",
    size: "lg",
    body: `
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
          <div><div class="muted">Phone</div><b>${esc(c.phone || "—")}</b></div>
          <div><div class="muted">Email</div><b>${esc(c.email || "—")}</b></div>
          <div style="grid-column:1/-1"><div class="muted">Address</div><div>${esc(c.address || "—")}</div></div>
          <div style="grid-column:1/-1"><div class="muted">Notes</div><div>${esc(c.notes || "—")}</div></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Purchases</div><b style="font-size:22px">${num(c.invoices)}</b></div>
        <div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Recorded spend</div><b style="font-size:22px">${money(c.spend)}</b></div>
        <div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Average bill</div><b style="font-size:22px">${money(c.invoices ? c.spend / c.invoices : 0)}</b></div>
      </div>
      <div class="muted" style="margin:-4px 0 12px">Showing invoices currently available to this POS (${HISTORY_DAYS} days).</div>
      <div class="table-wrap" style="max-height:42vh"><table class="table">
        <thead><tr><th>Invoice</th><th>Date</th><th>Payment</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>${c.sales.slice(0,100).map(s => `
          <tr class="clickable" data-invoice="${s.id}">
            <td><b class="mono">${esc(s.invoiceNo)}</b></td><td class="nowrap">${esc(fmtDateTime(s.createdAt))}</td>
            <td>${methodBadge(s.paymentMethod)}</td><td class="num"><b>${money(s.total)}</b></td>
            <td>${s.status === "voided" ? '<span class="badge badge-red">Voided</span>' : '<span class="badge badge-green">Paid</span>'}</td>
          </tr>`).join("") || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No invoices found.</td></tr>'}</tbody>
      </table></div>`,
    footer: `<button class="btn btn-outline" data-close>Close</button><button class="btn btn-primary" id="editCustomer">${icon("edit")} Edit profile</button>`,
  });
  modal.foot?.querySelector("[data-close]")?.addEventListener("click", () => modal.close());
  modal.$("#editCustomer")?.addEventListener("click", async () => {
    const saved = await editCustomer(c);
    if (saved) { modal.close(); renderRoot(); }
  });
  modal.body.querySelectorAll("tr[data-invoice]").forEach(row => row.addEventListener("click", () => openInvoiceById(Number(row.dataset.invoice), { onChange: () => modal.close() })));
}

function renderRoot() {
  if (!root) return;
  const F = root.__customerFilter || { search: "" };
  const all = buildCustomers();
  const q = F.search.toLowerCase();
  const list = all.filter(c => [c.name,c.phone,c.email,c.address].some(v => String(v || "").toLowerCase().includes(q)));
  const spend = all.reduce((n,c) => n+c.spend,0);
  $("#cStats",root).innerHTML = `
    <div class="card" style="padding:16px"><div class="muted">Customers</div><div style="font-size:28px;font-weight:800;margin-top:4px">${num(all.length)}</div><div class="muted" style="margin-top:4px">Saved profiles</div></div>
    <div class="card" style="padding:16px"><div class="muted">Recorded purchases</div><div style="font-size:28px;font-weight:800;margin-top:4px">${num(all.reduce((n,c)=>n+c.invoices,0))}</div><div class="muted" style="margin-top:4px">Completed invoices</div></div>
    <div class="card" style="padding:16px"><div class="muted">Customer revenue</div><div style="font-size:28px;font-weight:800;margin-top:4px">${money(spend)}</div><div class="muted" style="margin-top:4px">Recorded completed sales</div></div>`;
  $("#cSummary",root).innerHTML = `<span><b>${num(list.length)}</b> customers</span><span>Last ${HISTORY_DAYS} days</span>`;
  $("#cBody",root).innerHTML = list.length ? list.map(c => `
    <tr class="clickable" data-customer="${esc(profileKey(c))}">
      <td><b>${esc(c.name || "Customer")}</b></td><td>${c.phone ? '<span class="mono">'+esc(c.phone)+'</span>' : '<span class="muted">—</span>'}</td>
      <td class="num">${num(c.invoices)}</td><td class="num"><b>${money(c.spend)}</b></td>
      <td class="nowrap">${c.lastAt ? esc(fmtDateTime(c.lastAt)) : '<span class="muted">—</span>'}</td>
      <td><button class="btn btn-sm btn-soft" data-open>View</button></td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><div class="big">👤</div><h4>No customers found</h4><p>Add a customer profile or enter customer details while taking a sale.</p></div></td></tr>`;
}

export async function mount(el) {
  root = el;
  root.__customerFilter = { search: "" };
  el.innerHTML = `
    <div class="view-enter">
      <div class="page-head">
        <div><h2>Customers</h2><p>Manage customer profiles, contact details and purchase history.</p></div>
        <div class="actions"><button class="btn btn-primary" id="cAdd">${icon("plus")} Add customer</button><button class="btn btn-outline" id="cExport">${icon("download")} Export CSV</button></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px" id="cStats"></div>
      <div class="card"><div class="toolbar">
        <div class="search-box"><span data-icon="search"></span><input class="input" id="cSearch" placeholder="Search name, phone, email or address…" /></div>
        <div class="summary-line" id="cSummary"></div>
      </div>
      <div class="table-wrap" style="max-height:calc(100vh - 320px)"><table class="table">
        <thead><tr><th>Customer</th><th>Phone</th><th class="num">Purchases</th><th class="num">Recorded spend</th><th>Last purchase</th><th></th></tr></thead><tbody id="cBody"></tbody>
      </table></div></div>
    </div>`;
  $("#cAdd",el).onclick = async () => { await editCustomer(); renderRoot(); };
  $("#cSearch",el).addEventListener("input", debounce(e => { root.__customerFilter.search=e.target.value.trim(); renderRoot(); },150));
  $("#cBody",el).addEventListener("click",e => {
    const row=e.target.closest("tr[data-customer]"); if(!row) return;
    const c=buildCustomers().find(x=>profileKey(x)===row.dataset.customer); if(c) showCustomer(c);
  });
  $("#cExport",el).onclick=async()=>{ const {downloadFile}=await import("./ui.js"); const {toCsv}=await import("./transfer.js");
    const rows=[["Customer","Phone","Email","Address","Notes","Purchases","Recorded spend","Last purchase"]].concat(buildCustomers().map(c=>[c.name,c.phone,c.email,c.address,c.notes,c.invoices,c.spend.toFixed(2),c.lastAt?new Date(c.lastAt).toLocaleString():""]));
    downloadFile(`customers-${new Date().toISOString().slice(0,10)}.csv`,toCsv(rows),"text/csv;charset=utf-8"); };
  renderRoot();
}
export function refresh(){ renderRoot(); }
export function unmount(){ root=null; }
