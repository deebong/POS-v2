// Receipt renderer (used for on-screen preview and printing).
import { qrUrl } from "./qr.js";
import { state } from "./store.js";
import { esc, fmtDateTime, money, num, methodLabel } from "./ui.js";

export function receiptHtml(sale, items, settings = state.settings) {
  const lines = items
    .map(
      (it) => `
      <div class="rc-item">
        <div class="nm">${esc(it.name)}</div>
        <div class="calc"><span>${num(it.qty)} ${esc(it.unit)} × ${money(it.price)}</span><span>${money(it.lineSubtotal)}</span></div>
      </div>`,
    )
    .join("");

  const paid = sale.paymentMethod === "cash";
  return `
  <div class="receipt">
    ${sale.status === "voided" ? '<div class="rc-void">VOID</div>' : ""}
    <div class="rc-logo">🛒</div>
    <h2>${esc(settings.storeName)}</h2>
    <div class="rc-center rc-small">${esc(settings.address)}</div>
    <div class="rc-center rc-small">${esc(settings.phone)}${settings.taxId ? " · " + esc(settings.taxId) : ""}</div>
    <hr />
    <div class="rc-row"><span>Invoice</span><b>${esc(sale.invoiceNo)}</b></div>
    <div class="rc-row"><span>Date</span><span>${esc(fmtDateTime(sale.createdAt))}</span></div>
    <div class="rc-row"><span>Cashier</span><span>Alex K. · C1</span></div>
    ${sale.customerName ? `<div class="rc-row"><span>Customer</span><span>${esc(sale.customerName)}</span></div>` : ""}
    ${sale.customerPhone ? `<div class="rc-row"><span>Phone</span><span>${esc(sale.customerPhone)}</span></div>` : ""}
    <hr />
    ${lines}
    <hr />
    <div class="rc-row"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    ${sale.discount > 0 ? `<div class="rc-row"><span>Discount</span><span>-${money(sale.discount)}</span></div>` : ""}
    <div class="rc-row"><span>${esc(settings.taxLabel || "Tax")}</span><span>${money(sale.tax)}</span></div>
    <hr />
    <div class="rc-row rc-total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    <hr />
    <div class="rc-row"><span>Paid by</span><span>${esc(methodLabel(sale.paymentMethod))}</span></div>
    ${paid ? `<div class="rc-row"><span>Received</span><span>${money(sale.amountPaid)}</span></div><div class="rc-row"><span>Change</span><span>${money(sale.changeDue)}</span></div>` : ""}
    <hr />
    <img class="rc-qr" alt="Invoice QR" src="${qrUrl(sale.invoiceNo, { format: "svg" })}" />
    <div class="rc-center rc-small">Scan to look up this invoice</div>
    <div class="rc-center" style="margin-top:8px">${esc(settings.receiptFooter)}</div>
  </div>`;
}
