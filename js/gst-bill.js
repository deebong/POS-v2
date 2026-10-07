// Print-ready GST tax invoice.
// Uses the same sale/item records as the normal receipt, with company, customer,
// taxable-value and tax details. Browser printing can save the invoice as PDF.
import { esc, money } from "./ui.js";

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

function storePhones(settings) {
  try {
    const a = JSON.parse(settings.phoneNumbers || "[]");
    if (Array.isArray(a) && a.length) return a.map(x => x.number).filter(Boolean).join(" · ");
  } catch {}
  return settings.phone || "";
}

export function gstBillHtml(sale, items = [], settings = {}) {
  const discountRatio = num(sale.subtotal) > 0 ? num(sale.discount) / num(sale.subtotal) : 0;
  const lines = items.map((it) => {
    const taxable = r2(num(it.lineSubtotal) * (1 - discountRatio));
    const tax = r2(taxable * num(it.taxRate) / 100);
    return { ...it, taxable, tax, lineTotal: r2(taxable + tax) };
  });
  const taxableTotal = r2(lines.reduce((s, x) => s + x.taxable, 0));
  const taxTotal = r2(lines.reduce((s, x) => s + x.tax, 0));
  const total = r2(taxableTotal + taxTotal);
  const rates = [...new Set(lines.map(x => num(x.taxRate)).filter(x => x > 0))].sort((a,b) => a-b);
  const company = settings.storeName || "Store";
  const phone = storePhones(settings);
  const currency = settings.currency || "₹";
  const taxLabel = settings.taxLabel || "GST";
  const customer = sale.customerName || "Walk-in customer";

  const rows = lines.map((it) => `
    <tr>
      <td><b>${esc(it.name || "")}</b><div class="muted">${esc(it.sku || "—")}</div></td>
      <td class="r">${esc(String(it.qty ?? ""))} ${esc(it.unit || "")}</td>
      <td class="r">${currency}${num(it.price).toFixed(2)}</td>
      <td class="r">${currency}${it.taxable.toFixed(2)}</td>
      <td class="r">${num(it.taxRate).toFixed(2)}%</td>
      <td class="r">${currency}${it.tax.toFixed(2)}</td>
      <td class="r"><b>${currency}${it.lineTotal.toFixed(2)}</b></td>
    </tr>`).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>GST Bill ${esc(sale.invoiceNo)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#fff;color:#111827;font-size:12px}
.invoice{max-width:900px;margin:0 auto;padding:28px}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111827;padding-bottom:16px}
.company h1{font-size:22px;margin:0 0 5px}.company div{margin:2px 0;color:#4b5563}.title{text-align:right}.title h2{margin:0 0 6px;font-size:20px}.title b{font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.box{border:1px solid #d1d5db;border-radius:8px;padding:12px}.box h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 7px;color:#6b7280}.box p{margin:3px 0}
table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#f3f4f6;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}th,td{border:1px solid #d1d5db;padding:8px}td.r,th.r{text-align:right}.muted{font-size:10px;color:#6b7280;margin-top:2px}
.summary{margin-left:auto;width:330px;margin-top:14px}.sum{display:flex;justify-content:space-between;padding:5px 0}.grand{border-top:2px solid #111827;font-size:16px;font-weight:800;padding-top:9px}
.taxbox{margin-top:16px;border:1px solid #d1d5db;padding:10px}.footer{margin-top:24px;border-top:1px solid #d1d5db;padding-top:12px;color:#6b7280}
@media print{body{font-size:11px}.invoice{max-width:none;padding:8mm}.no-print{display:none!important}@page{size:A4;margin:8mm}}
</style></head><body><main class="invoice">
<section class="top"><div class="company"><h1>${esc(company)}</h1>
${settings.address ? `<div>${esc(settings.address)}</div>` : ""}
${phone ? `<div>Phone: ${esc(phone)}</div>` : ""}
${settings.taxId ? `<div><b>${esc(taxLabel)}IN / Tax ID:</b> ${esc(settings.taxId)}</div>` : ""}</div>
<div class="title"><h2>TAX INVOICE / GST BILL</h2><div>Invoice: <b>${esc(sale.invoiceNo)}</b></div><div>Date: ${esc(new Date(sale.createdAt).toLocaleString())}</div><div>Status: ${esc(sale.status || "completed")}</div></div></section>

<section class="grid"><div class="box"><h3>Bill To</h3><p><b>${esc(customer)}</b></p>${sale.customerAddress ? `<p>${esc(sale.customerAddress)}</p>` : ""}${sale.customerPhone ? `<p>Phone: ${esc(sale.customerPhone)}</p>` : ""}</div>
<div class="box"><h3>Payment</h3><p>Method: <b>${esc(sale.paymentMethod === "upi" ? "UPI / QR" : sale.paymentMethod === "card" ? "Card" : "Cash")}</b></p><p>Amount paid: <b>${currency}${num(sale.amountPaid).toFixed(2)}</b></p>${num(sale.changeDue)>0 ? `<p>Change due: ${currency}${num(sale.changeDue).toFixed(2)}</p>` : ""}</div></section>

<table><thead><tr><th>Item / SKU</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">${esc(taxLabel)} %</th><th class="r">Tax</th><th class="r">Line total</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No line items</td></tr>'}</tbody></table>

<div class="summary"><div class="sum"><span>Subtotal</span><b>${currency}${num(sale.subtotal).toFixed(2)}</b></div><div class="sum"><span>Discount</span><b>− ${currency}${num(sale.discount).toFixed(2)}</b></div><div class="sum"><span>Taxable value</span><b>${currency}${taxableTotal.toFixed(2)}</b></div><div class="sum"><span>${esc(taxLabel)}</span><b>${currency}${taxTotal.toFixed(2)}</b></div><div class="sum grand"><span>Grand Total</span><span>${currency}${total.toFixed(2)}</span></div></div>

<div class="taxbox"><b>Tax summary</b><div class="muted">${rates.length ? rates.map(r => `${r.toFixed(2)}% ${esc(taxLabel)}: ${currency}${lines.filter(x=>num(x.taxRate)===r).reduce((s,x)=>s+x.tax,0).toFixed(2)}`).join(" · ") : "No GST/tax charged on this invoice."}</div></div>
<div class="footer">${settings.receiptFooter ? esc(settings.receiptFooter) : "Thank you for your business."}</div>
</main></body></html>`;
}

export function gstBillDocument(sale, items, settings) {
  return gstBillHtml(sale, items, settings);
}
