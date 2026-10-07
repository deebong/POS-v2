// Invoices / sales history + invoice modal (shared with POS)
import { receiptHtml } from "./receipt.js";
import { requestApproval } from "./approval.js";
import { HISTORY_DAYS, lookupInvoice, state, voidSale } from "./store.js";
import {
  $, confirmDialog, debounce, esc, fmtDateTime, hydrateIcons, icon, methodBadge, money, num, openModal, printHtml, toast,
} from "./ui.js";

export function showInvoiceModal(sale, items, { success = false, onNewSale, onChange } = {}) {
  const voided = sale.status === "voided";
  const head = success
    ? `<div class="success-head" style="padding:22px 22px 4px"><div class="success-check">${icon("check")}</div>
        <h4>${money(sale.total)} received</h4>
        <p class="muted">Invoice ${esc(sale.invoiceNo)}${sale.paymentMethod === "cash" && sale.changeDue > 0 ? ` · Change due <b style="color:var(--text)">${money(sale.changeDue)}</b>` : ""}</p></div>`
    : "";
  const modal = openModal({
    title: success ? "Payment successful" : sale.invoiceNo,
    sub: success ? "" : `${fmtDateTime(sale.createdAt)} · ${voided ? "Voided" : "Completed"}`,
    size: "md",
    flush: true,
    body: `${head}<div class="receipt-stage" style="${success ? "margin-top:12px" : ""}">${receiptHtml(sale, items)}</div>`,
    footer: success
      ? `<button class="btn btn-outline" data-print>${icon("printer")} Print receipt</button><button class="btn btn-outline" data-whatsapp ${sale.customerPhone ? "" : "disabled title=\"Add a customer phone number to enable WhatsApp\""}>${icon("phone")} WhatsApp</button><button class="btn btn-primary" data-new style="min-width:150px">${icon("plus")} New sale</button>`
      : `${voided ? "" : `<button class="btn btn-danger-soft left" data-void>${icon("undo")} Void / refund</button>`}<button class="btn btn-outline" data-close2>Close</button><button class="btn btn-primary" data-print>${icon("printer")} Print</button>`,
    onClose: () => {
      if (success && onNewSale) onNewSale();
    },
  });
  const wa = modal.$("[data-whatsapp]");
  if (wa && sale.customerPhone) {
    wa.onclick = () => {
      const phone = String(sale.customerPhone).replace(/\D/g, "");
      const text = `Thank you for shopping at ${state.settings.storeName}. Invoice ${sale.invoiceNo} total ${money(sale.total)}. Payment: ${sale.paymentMethod === "upi" ? "UPI / QR" : sale.paymentMethod === "card" ? "Card" : "Cash"}. ${state.settings.receiptFooter || ""}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    };
  }
  modal.$("[data-print]").onclick = () => printHtml(receiptHtml(sale, items));
  const n = modal.$("[data-new]");
  if (n) {
    n.onclick = () => modal.close();
    n.focus();
  }
  const c = modal.$("[data-close2]");
  if (c) c.onclick = () => modal.close();
  const v = modal.$("[data-void]");
  if (v) {
    v.onclick = async () => {
      const ok = await confirmDialog({
        title: `Void ${sale.invoiceNo}?`,
        message: "The invoice will be marked as void and its items will be returned to stock. This cannot be undone.",
        confirmText: "Void invoice",
        danger: true,
      });
      if (!ok) return;
      v.disabled = true;
      try {
        await requestApproval({ action: "Void invoice", minRole: "manager", detail: `${sale.invoiceNo} · ${money(sale.total)}` });
        const res = await voidSale(sale.id);
        toast("Invoice voided and stock restored");
        modal.close();
        if (onChange) onChange();
        showInvoiceModal(res.sale, res.items, { onChange });
      } catch (e) {
        v.disabled = false;
        toast(e.message, "error");
      }
    };
  }
  return modal;
}

export function openInvoiceById(id, opts = {}) {
  const sale = state.sales.find((s) => s.id === id);
  if (!sale) return toast("Invoice not found", "error");
  return showInvoiceModal(sale, state.items.get(id) || [], opts);
}

/** Look up by invoice number (e.g. scanned from a receipt QR). Resolves true if found. */
export async function openInvoiceByNo(no, opts = {}) {
  const hit = await lookupInvoice(no);
  if (!hit) return false;
  showInvoiceModal(hit.sale, hit.items, opts);
  return true;
}

/* ------------------------------ page ------------------------------ */
export async function mount(el) {
  const F = { range: "7d", search: "", method: "all", status: "all" };
  el.innerHTML = `
    <div class="view-enter">
      <div class="page-head">
        <div><h2>Invoices</h2><p>Review past bills, reprint receipts and void mistakes. Showing the last ${HISTORY_DAYS} days.</p></div>
        <div class="actions"><button class="btn btn-outline" id="sExport">${icon("download")} Export CSV</button></div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search-box"><span data-icon="search"></span><input class="input" id="sSearch" placeholder="Search invoice no., customer, phone…" /></div>
          <select class="select" id="sRange">
            <option value="today">Today</option><option value="7d" selected>Last 7 days</option><option value="30d">Last 30 days</option><option value="all">Last ${HISTORY_DAYS} days</option>
          </select>
          <select class="select" id="sMethod"><option value="all">All payments</option><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI / QR</option></select>
          <select class="select" id="sStatus"><option value="all">All statuses</option><option value="completed">Completed</option><option value="voided">Voided</option></select>
          <div class="summary-line" id="sSummary"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 300px)"><table class="table">
          <thead><tr><th>Invoice</th><th>Date & time</th><th>Customer</th><th class="num">Items</th><th>Payment</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody id="sBody"></tbody>
        </table></div>
      </div>
    </div>`;
  hydrateIcons(el);

  const filtered = () => {
    const now = new Date();
    const startOf = (daysAgo) => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - daysAgo);
      return d.getTime();
    };
    const since = F.range === "today" ? startOf(0) : F.range === "7d" ? startOf(6) : F.range === "30d" ? startOf(29) : 0;
    const q = F.search.toLowerCase();
    return state.sales.filter((s) => {
      if (new Date(s.createdAt).getTime() < since) return false;
      if (F.method !== "all" && s.paymentMethod !== F.method) return false;
      if (F.status !== "all" && s.status !== F.status) return false;
      if (q && !(s.invoiceNo.toLowerCase().includes(q) || (s.customerName || "").toLowerCase().includes(q) || (s.customerPhone || "").includes(q))) return false;
      return true;
    });
  };

  function render() {
    const list = filtered();
    const done = list.filter((s) => s.status === "completed");
    $("#sSummary", el).innerHTML = `<span><b>${num(done.length)}</b> invoices</span><span>Revenue <b>${money(done.reduce((s, x) => s + x.total, 0))}</b></span>`;
    $("#sBody", el).innerHTML = list.length
      ? list
          .slice(0, 300)
          .map(
            (s) => `
        <tr class="clickable ${s.status === "voided" ? "dim-when-voided" : ""}" data-id="${s.id}">
          <td><b class="mono">${esc(s.invoiceNo)}</b></td>
          <td class="nowrap">${esc(fmtDateTime(s.createdAt))}</td>
          <td>${s.customerName ? esc(s.customerName) : '<span class="muted">Walk-in</span>'}${s.customerPhone ? `<div class="muted" style="font-size:12px">${esc(s.customerPhone)}</div>` : ""}</td>
          <td class="num">${s.itemCount}</td>
          <td>${methodBadge(s.paymentMethod)}</td>
          <td class="num"><b>${money(s.total)}</b></td>
          <td>${s.status === "voided" ? '<span class="badge badge-red">Voided</span>' : '<span class="badge badge-green">Paid</span>'}</td>
          <td><div class="row-actions"><button class="icon-btn primary" data-print title="Print receipt">${icon("printer")}</button></div></td>
        </tr>`,
          )
          .join("") + (list.length > 300 ? `<tr><td colspan="8" class="muted" style="text-align:center">Showing the newest 300 of ${list.length} — narrow the filters to see more.</td></tr>` : "")
      : `<tr><td colspan="8"><div class="empty"><div class="big">🧾</div><h4>No invoices found</h4><p>Completed sales will show up here.</p></div></td></tr>`;
  }

  $("#sBody", el).addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const id = Number(row.dataset.id);
    const sale = state.sales.find((s) => s.id === id);
    if (!sale) return;
    if (e.target.closest("[data-print]")) return printHtml(receiptHtml(sale, state.items.get(id) || []));
    openInvoiceById(id, { onChange: render });
  });
  $("#sSearch", el).addEventListener("input", debounce((e) => { F.search = e.target.value.trim(); render(); }, 200));
  $("#sRange", el).onchange = (e) => { F.range = e.target.value; render(); };
  $("#sMethod", el).onchange = (e) => { F.method = e.target.value; render(); };
  $("#sStatus", el).onchange = (e) => { F.status = e.target.value; render(); };
  $("#sExport", el).onclick = async () => {
    const { downloadFile } = await import("./ui.js");
    const { toCsv } = await import("./transfer.js");
    const rows = [["Invoice", "Date", "Customer", "Phone", "Items", "Payment", "Subtotal", "Discount", "Tax", "Total", "Status"]].concat(
      filtered().map((s) => [s.invoiceNo, new Date(s.createdAt).toLocaleString(), s.customerName, s.customerPhone, s.itemCount, s.paymentMethod, s.subtotal, s.discount, s.tax, s.total, s.status]),
    );
    downloadFile(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };
  render();
}
