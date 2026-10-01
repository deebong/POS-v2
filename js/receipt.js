// Receipt renderer (used for on-screen preview and printing).
import { qrUrl } from "./qr.js";
import { state } from "./store.js";
import { esc, fmtDateTime, money, num, methodLabel } from "./ui.js";

const CASHIER_NAME = "Anand I";
const COUNTER_NAME = "C1";

export function receiptHtml(sale, items, settings = state.settings) {
  const rmoney = (n) => {
    const raw = money(n, settings);
    if ((settings && settings.currency) !== "\u20B9") return esc(raw);
    const text = String(raw);
    const neg = text.indexOf("-\u20B9") === 0;
    const amount = neg ? text.slice(2) : text.slice(1);
    return (neg ? "-" : "") + '<span class="rc-currency" aria-label="\u20B9">\u20B9</span>' + esc(amount);
  };
  const lines = items
    .map(
      (it) => `
      <div class="rc-item">
        <div class="nm">${esc(it.name)}</div>
        <div class="calc"><span>${num(it.qty)} ${esc(it.unit)} × ${rmoney(it.price)}</span><span>${rmoney(it.lineSubtotal)}</span></div>
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
    <div class="rc-row"><span>Cashier</span><span>${esc(CASHIER_NAME)} · ${esc(COUNTER_NAME)}</span></div>
    ${sale.customerName ? `<div class="rc-row"><span>Customer</span><span>${esc(sale.customerName)}</span></div>` : ""}
    ${sale.customerPhone ? `<div class="rc-row"><span>Phone</span><span>${esc(sale.customerPhone)}</span></div>` : ""}
    <hr />
    ${lines}
    <hr />
    <div class="rc-row"><span>Subtotal</span><span>${rmoney(sale.subtotal)}</span></div>
    ${sale.discount > 0 ? `<div class="rc-row"><span>Discount</span><span>-${rmoney(sale.discount)}</span></div>` : ""}
    <div class="rc-row"><span>${esc(settings.taxLabel || "Tax")}</span><span>${rmoney(sale.tax)}</span></div>
    <hr />
    <div class="rc-row rc-total"><span>TOTAL</span><span>${rmoney(sale.total)}</span></div>
    <hr />
    <div class="rc-row"><span>Paid by</span><span>${esc(methodLabel(sale.paymentMethod))}</span></div>
    ${paid ? `<div class="rc-row"><span>Received</span><span>${rmoney(sale.amountPaid)}</span></div><div class="rc-row"><span>Change</span><span>${rmoney(sale.changeDue)}</span></div>` : ""}
    <hr />
    <img class="rc-qr" alt="Invoice QR" src="${qrUrl(sale.invoiceNo, { format: "svg" })}" />
    <div class="rc-center rc-small">Scan to look up this invoice</div>
    <div class="rc-center" style="margin-top:8px">${esc(settings.receiptFooter)}</div>
  </div>`;
}
