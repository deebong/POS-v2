// POS / Billing screen
import { mediaHtml } from "./media.js";
import { qrUrl } from "./qr.js";
import { requestApproval, requiredRoleForDiscount } from "./approval.js";
import { calcTotals } from "./data/logic.js";
import { uid } from "./data/logic.js";
import { openScanner } from "./scanner.js";
import { openInvoiceByNo, showInvoiceModal } from "./sales.js";
import {
  catTint, categoryCounts, checkout, findByCode, isWeighed, productById, refreshData, state, stockStatus,
} from "./store.js";
import {
  $, $$, beep, confirmDialog, debounce, esc, fmtDateTime, hydrateIcons, icon, methodLabel, money, num, openModal, toast,
} from "./ui.js";

const LS_CART = "freshmart.cart";
const LS_HELD = "freshmart.held";

const S = {
  cart: [], // [{ productId, qty }]
  discount: { type: "none", value: 0 },
  customer: { name: "", phone: "", address: "" },
  search: "",
  category: "all",
  discountOpen: false,
};
let root = null;
let focusLine = null;

/* ---------- persistence ---------- */
const persist = () =>
  localStorage.setItem(LS_CART, JSON.stringify({ cart: S.cart, discount: S.discount, customer: S.customer }));

function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_CART) || "null");
    if (d) {
      S.cart = Array.isArray(d.cart) ? d.cart : [];
      S.discount = d.discount || { type: "none", value: 0 };
      S.customer = d.customer || { name: "", phone: "", address: "" };
    }
  } catch {
    /* ignore */
  }
}
const getHeld = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_HELD) || "[]");
  } catch {
    return [];
  }
};
const setHeld = (list) => localStorage.setItem(LS_HELD, JSON.stringify(list));

// Re-links cart lines after a sync (products created on this PC get their final id from the sheet) — by SKU.
function sanitize() {
  S.cart = S.cart
    .map((l) => ({ ...l, p: productById(l.productId) || (l.sku ? findByCode(l.sku) : null) }))
    .filter((l) => l.p && l.p.stock > 0 && l.qty > 0)
    .map((l) => ({ productId: l.p.id, sku: l.p.sku, qty: Math.min(l.qty, l.p.stock) }));
}

function resetOrder() {
  S.cart = [];
  S.discount = { type: "none", value: 0 };
  S.customer = { name: "", phone: "", address: "" };
  S.discountOpen = false;
  persist();
}

/* ---------- derived ---------- */
const cartItems = () => S.cart.map((l) => ({ l, p: productById(l.productId) })).filter((x) => x.p);
function totals() {
  const items = cartItems();
  return calcTotals(items.map(({ l, p }) => ({ price: p.price, qty: l.qty, taxRate: p.taxRate })), S.discount);
}
const stepFor = (p) => (isWeighed(p.unit) ? 0.25 : 1);

function visibleProducts() {
  const q = S.search.trim().toLowerCase();
  if (S.category === "popular") {
    const counts = new Map();
    for (const sale of state.sales.filter(x => x.status === "completed")) for (const it of state.items.get(sale.id) || []) counts.set(it.productId, (counts.get(it.productId) || 0) + Number(it.qty || 0));
    return state.products.filter(p => counts.has(p.id)).sort((a,b) => (counts.get(b.id)||0) - (counts.get(a.id)||0)).slice(0, 24).filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode||"").toLowerCase().includes(q));
  }
  return state.products.filter(
    (p) =>
      (S.category === "all" || p.category === S.category) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)),
  );
}

/* ---------- cart mutations ---------- */
function changed() {
  persist();
  renderCart();
  renderGrid();
}

function setQty(pid, qty) {
  const p = productById(pid);
  const line = S.cart.find((l) => l.productId === pid);
  if (!p || !line) return;
  qty = isWeighed(p.unit) ? Math.round(qty * 1000) / 1000 : Math.round(qty);
  if (!(qty > 0)) {
    S.cart = S.cart.filter((l) => l.productId !== pid);
    return changed();
  }
  if (qty > p.stock) {
    qty = p.stock;
    toast(`Only ${num(p.stock)} ${p.unit} of ${p.name} in stock`, "warn");
  }
  line.qty = qty;
  changed();
}

function addProduct(pid, { focus = false } = {}) {
  const p = productById(pid);
  if (!p) return false;
  if (p.stock <= 0) {
    toast(`${p.name} is out of stock`, "error");
    return false;
  }
  const line = S.cart.find((l) => l.productId === pid);
  if (line) {
    if (focus && isWeighed(p.unit)) {
      focusLine = pid;
      renderCart();
      return true;
    }
    setQty(pid, line.qty + 1);
  } else {
    S.cart.push({ productId: pid, sku: p.sku, qty: Math.min(1, p.stock) });
    if (focus && isWeighed(p.unit)) focusLine = pid;
    changed();
  }
  return true;
}

/* ---------- rendering ---------- */
function renderCats() {
  const counts = categoryCounts();
  const popularCount = (() => { const ids = new Set(); for (const sale of state.sales.filter(x => x.status === "completed")) for (const it of state.items.get(sale.id) || []) ids.add(it.productId); return ids.size; })();
  $("#posCats", root).innerHTML =
    `<button class="chip ${S.category === "all" ? "active" : ""}" data-cat="all">All items <span class="count">${state.products.length}</span></button>` +
    `<button class="chip ${S.category === "popular" ? "active" : ""}" data-cat="popular">Most Popular <span class="count">${popularCount}</span></button>` +
    counts
      .map(
        ([c, n]) =>
          `<button class="chip ${S.category === c ? "active" : ""}" data-cat="${esc(c)}">${esc(c)} <span class="count">${n}</span></button>`,
      )
      .join("");
}

function renderGrid() {
  const list = visibleProducts();
  const inCart = new Map(S.cart.map((l) => [l.productId, l.qty]));
  const grid = $("#posGrid", root);
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><h4>No products found</h4><p>Try a different search or category.</p></div>`;
    return;
  }
  grid.innerHTML = list
    .map((p) => {
      const st = stockStatus(p);
      const stk =
        st === "out" ? "Out of stock" : st === "low" ? `Only ${num(p.stock)} left` : `${num(p.stock)} in stock`;
      const q = inCart.get(p.id);
      return `
      <button class="pcard" data-id="${p.id}" ${st === "out" ? "disabled" : ""} title="${esc(p.name)}">
        <span class="sku">${esc(p.sku)}</span>
        ${q ? `<span class="in-cart">${num(q)}</span>` : ""}
        <div class="pic" style="--tint:${catTint(p.category)}">${mediaHtml(p)}</div>
        <div class="nm">${esc(p.name)}</div>
        <div class="row">
          <div class="price">${money(p.price)}<small>/${esc(p.unit)}</small></div>
          <div class="stk ${st}">${stk}</div>
        </div>
      </button>`;
    })
    .join("");
}

function renderCart() {
  const items = cartItems();
  const calc = totals();
  const count = items.length;
  $("#cartCount", root).textContent = count;
  $("#fabTotal", root).textContent = count ? `${count} · ${money(calc.total)}` : "Cart";
  const heldN = getHeld().length;
  $("#heldCount", root).textContent = heldN ? heldN : "";
  $("#heldCount", root).classList.toggle("hidden", !heldN);

  const box = $("#cartLines", root);
  if (!count) {
    box.innerHTML = `<div class="cart-empty"><div><div class="big">🛒</div><b>Cart is empty</b>Tap a product, scan a QR / barcode<br/>or type a SKU in the search box.</div></div>`;
  } else {
    box.innerHTML = items
      .map(({ l, p }, i) => {
        const lineTotal = calc.lines[i].lineSubtotal;
        return `
        <div class="cline" data-id="${p.id}">
          <div class="thumb" style="background:${catTint(p.category)}">${mediaHtml(p)}</div>
          <div style="min-width:0"><div class="nm" title="${esc(p.name)}">${esc(p.name)}</div><div class="unit">${money(p.price)} / ${esc(p.unit)}${p.taxRate ? ` · ${num(p.taxRate)}% ${esc(state.settings.taxLabel)}` : ""}</div></div>
          <div class="total">${money(lineTotal)}</div>
          <div class="ctrl">
            <div class="stepper">
              <button data-act="dec" aria-label="Decrease">${icon("minus", "sm")}</button>
              <input data-act="qty" inputmode="decimal" value="${l.qty}" aria-label="Quantity" />
              <button data-act="inc" aria-label="Increase">${icon("plus", "sm")}</button>
            </div>
            <span class="uname">${esc(p.unit)}</span>
            <button class="icon-btn danger rm" data-act="rm" aria-label="Remove">${icon("trash")}</button>
          </div>
        </div>`;
      })
      .join("");
  }

  // summary
  const hasDisc = S.discount.type !== "none" && S.discount.value > 0;
  const discLabel = hasDisc
    ? `Discount (${S.discount.type === "percent" ? num(S.discount.value) + "%" : money(S.discount.value)})`
    : "Discount";
  $("#cartSummary", root).innerHTML = `
    <div class="sum-row"><span>Subtotal</span><b>${money(calc.subtotal)}</b></div>
    <div class="sum-row">
      <span>${discLabel} <button class="link-btn" id="discToggle">${hasDisc ? "Edit" : "+ Add"}</button></span>
      <b class="discount-val">${calc.discount > 0 ? "-" + money(calc.discount) : money(0)}</b>
    </div>
    ${
      S.discountOpen
        ? `<div class="discount-editor">
            <div class="segmented" id="discType">
              <button data-t="percent" class="${S.discount.type !== "amount" ? "active" : ""}">%</button>
              <button data-t="amount" class="${S.discount.type === "amount" ? "active" : ""}">${esc(state.settings.currency)}</button>
            </div>
            <input class="input" id="discValue" inputmode="decimal" placeholder="0" value="${hasDisc ? S.discount.value : ""}" />
            <button class="btn btn-sm btn-primary" id="discApply">Apply</button>
            ${hasDisc ? '<button class="btn btn-sm btn-danger-soft" id="discRemove">Remove</button>' : ""}
          </div>`
        : ""
    }
    <div class="sum-row"><span>${esc(state.settings.taxLabel)}</span><b>${money(calc.tax)}</b></div>
    <div class="sum-total"><span>Total</span><b>${money(calc.total)}</b></div>
    <button class="btn btn-primary btn-lg btn-block" id="btnPay" ${count ? "" : "disabled"}>
      ${icon("card")} Charge ${money(calc.total)} <span class="kbd">F9</span>
    </button>`;

  if (focusLine) {
    const inp = $(`.cline[data-id="${focusLine}"] input[data-act="qty"]`, root);
    if (inp) {
      inp.focus();
      inp.select();
    }
    focusLine = null;
  }
  if (S.discountOpen) {
    const dv = $("#discValue", root);
    if (dv && document.activeElement !== dv) dv.focus();
  }
}

/* ---------- payment ---------- */
function openPayment() {
  const items = cartItems();
  if (!items.length) return toast("Add items to the cart first", "warn");
  const calc = totals();
  const total = calc.total;
  let method = "cash";
  let busy = false;
  const clientRef = uid(); // makes retries safe: the backend never charges the same bill twice

  const modal = openModal({
    title: "Take payment",
    sub: `${items.length} item${items.length > 1 ? "s" : ""}${S.customer.name ? " · " + S.customer.name : ""}`,
    size: "md",
    body: "",
    footer: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="payConfirm" style="min-width:180px">${icon("check")} Complete payment</button>`,
    onClose: () => setTimeout(focusSearch, 50),
  });
  const confirmBtn = modal.$("#payConfirm");
  modal.$("[data-cancel]").onclick = () => modal.close();

  const quick = () => {
    const opts = new Set();
    const notes = state.settings.currency === "₹" ? [10, 50, 100, 200, 500, 2000] : [5, 10, 20, 50, 100];
    for (const step of notes) {
      const v = Math.ceil(total / step) * step;
      if (v > total + 0.001) opts.add(v);
    }
    return [...opts].slice(0, 4);
  };

  function render() {
    let panel = "";
    if (method === "cash") {
      panel = `
        <div class="field"><label for="payReceived">Amount received</label>
          <div class="input-group"><span class="addon">${esc(state.settings.currency)}</span>
          <input class="input" id="payReceived" inputmode="decimal" value="${total.toFixed(2)}" style="font-size:20px;font-weight:700;height:52px" /></div></div>
        <div class="quick-cash"><button type="button" data-cash="${total}">Exact</button>${quick()
          .map((v) => `<button type="button" data-cash="${v}">${money(v)}</button>`)
          .join("")}</div>
        <div class="change-box" id="changeBox"></div>`;
    } else if (method === "card") {
      panel = `<div class="pay-note">${icon("card", "lg")}<div>Ask the customer to tap, insert or swipe their card on the terminal for <b>${money(total)}</b>, then confirm once approved.</div></div>`;
    } else {
      const s = state.settings;
      let defaultUpi = s.upiId || "";
      try { const ids = JSON.parse(s.upiIds || "[]"); const hit = ids.find(x => x && x.enabled !== false && x.id); if (hit) defaultUpi = hit.id; } catch {}
      const payload = defaultUpi
        ? `upi://pay?pa=${encodeURIComponent(defaultUpi)}&pn=${encodeURIComponent(s.storeName)}&am=${total.toFixed(2)}&cu=INR&tn=POS%20payment`
        : `${s.storeName} | PAY ${s.currency}${total.toFixed(2)}`;
      panel = `<div class="pay-qr"><img alt="Payment QR" src="${qrUrl(payload, { format: "svg" })}" /><div class="muted">Customer scans this QR to pay <b style="color:var(--text)">${money(total)}</b></div></div>`;
    }
    modal.body.innerHTML = `
      <div class="pay-total"><div class="lbl">Amount due</div><div class="amt">${money(total)}</div></div>
      <div class="segmented full" id="payMethods" style="margin-bottom:16px">
        <button data-m="cash" class="${method === "cash" ? "active" : ""}">${icon("cash")} Cash</button>
        <button data-m="card" class="${method === "card" ? "active" : ""}">${icon("card")} Card</button>
        <button data-m="upi" class="${method === "upi" ? "active" : ""}">${icon("qr")} UPI / QR</button>
      </div>
      ${panel}`;
    if (method === "cash") {
      const inp = modal.$("#payReceived");
      inp.addEventListener("input", updateChange);
      inp.focus();
      inp.select();
      updateChange();
    }
  }

  const received = () => Number(String(modal.$("#payReceived")?.value || "").replace(/,/g, ""));
  function updateChange() {
    const box = modal.$("#changeBox");
    if (!box) return;
    const r = received();
    const diff = Math.round((r - total) * 100) / 100;
    if (!Number.isFinite(r) || diff < 0) {
      box.className = "change-box short";
      box.innerHTML = `<span>${Number.isFinite(r) ? "Short by" : "Enter amount"}</span><b>${Number.isFinite(r) ? money(-diff) : "—"}</b>`;
      confirmBtn.disabled = true;
    } else {
      box.className = "change-box";
      box.innerHTML = `<span>Change due</span><b>${money(diff)}</b>`;
      confirmBtn.disabled = false;
    }
  }

  modal.body.addEventListener("click", (e) => {
    const m = e.target.closest("[data-m]");
    if (m) {
      method = m.dataset.m;
      confirmBtn.disabled = false;
      render();
      return;
    }
    const c = e.target.closest("[data-cash]");
    if (c) {
      modal.$("#payReceived").value = Number(c.dataset.cash).toFixed(2);
      updateChange();
    }
  });
  modal.el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !confirmBtn.disabled && !busy && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      confirmBtn.click();
    }
  });

  confirmBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = "Processing…";
    try {
      const res = await checkout({
        items: S.cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        discountType: S.discount.type,
        discountValue: S.discount.value,
        customerName: S.customer.name,
        customerPhone: S.customer.phone,
        customerAddress: S.customer.address,
        paymentMethod: method,
        amountPaid: method === "cash" ? received() : total,
        clientRef,
      });
      modal.close();
      resetOrder();
      syncInputs();
      renderCats();
      changed();
      showInvoiceModal(res.sale, res.items, { success: true, onNewSale: focusSearch });
    } catch (err) {
      busy = false;
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `${icon("check")} Complete payment`;
      toast(err.message, "error");
      if (/stock|available/i.test(err.message)) {
        await refreshData();
        sanitize();
        changed();
        modal.close();
      }
    }
  });

  render();
}

/* ---------- hold / recall ---------- */
function holdOrder() {
  const items = cartItems();
  if (!items.length) return toast("Nothing to hold", "warn");
  const calc = totals();
  const held = getHeld();
  held.unshift({
    id: Date.now(),
    at: new Date().toISOString(),
    cart: S.cart,
    discount: S.discount,
    customer: S.customer,
    total: calc.total,
    count: items.length,
  });
  setHeld(held.slice(0, 20));
  resetOrder();
  syncInputs();
  changed();
  toast("Order put on hold");
}

function openHeld() {
  const modal = openModal({ title: "Held orders", sub: "Recall a parked order to continue billing", size: "md", body: "" });
  const draw = () => {
    const held = getHeld();
    modal.body.innerHTML = held.length
      ? `<div class="list">${held
          .map(
            (h) => `
        <div class="list-row" data-hid="${h.id}">
          <div class="thumb">${icon("pause")}</div>
          <div class="grow"><div class="t">${h.customer && h.customer.name ? esc(h.customer.name) : "Walk-in customer"}</div>
            <div class="s">${h.count} item${h.count > 1 ? "s" : ""} · ${esc(fmtDateTime(h.at))}</div></div>
          <b>${money(h.total)}</b>
          <button class="btn btn-sm btn-soft" data-recall>Recall</button>
          <button class="icon-btn danger" data-del aria-label="Delete">${icon("trash")}</button>
        </div>`,
          )
          .join("")}</div>`
      : `<div class="empty"><div class="big">🗂️</div><h4>No held orders</h4><p>Use the pause button to park the current order.</p></div>`;
  };
  draw();
  modal.body.addEventListener("click", (e) => {
    const row = e.target.closest("[data-hid]");
    if (!row) return;
    const id = Number(row.dataset.hid);
    if (e.target.closest("[data-del]")) {
      setHeld(getHeld().filter((h) => h.id !== id));
      draw();
      renderCart();
    } else if (e.target.closest("[data-recall]")) {
      if (cartItems().length) return toast("Hold or clear the current order first", "warn");
      const h = getHeld().find((x) => x.id === id);
      if (!h) return;
      S.cart = h.cart;
      S.discount = h.discount;
      S.customer = h.customer;
      sanitize();
      setHeld(getHeld().filter((x) => x.id !== id));
      persist();
      syncInputs();
      changed();
      modal.close();
      toast("Order recalled");
    }
  });
}

/* ---------- scanning ---------- */
export function startScan() {
  openScanner({
    title: "Scan items",
    continuous: true,
    onCode: async (code) => {
      if (/^INV-/i.test(code)) {
        const found = await openInvoiceByNo(code);
        return { ok: found, message: found ? "Invoice opened" : `Invoice ${code} not found` };
      }
      const p = findByCode(code);
      if (!p) return { ok: false, message: `No product for "${code}"` };
      if (p.stock <= 0) return { ok: false, message: `${p.name} is out of stock` };
      const ok = addProduct(p.id);
      return { ok, message: ok ? `${p.emoji} ${p.name} added` : undefined };
    },
  });
}

/* ---------- helpers ---------- */
function focusSearch() {
  const el = $("#posSearch", root);
  if (el) {
    el.focus();
    el.select();
  }
}
function syncInputs() {
  const n = $("#custName", root);
  const ph = $("#custPhone", root), addr = $("#custAddress", root);
  if (n) n.value = S.customer.name || "";
  if (ph) ph.value = S.customer.phone || "";
  if (addr) addr.value = S.customer.address || "";
}
function clearSearch() {
  S.search = "";
  const el = $("#posSearch", root);
  if (el) el.value = "";
  renderGrid();
}

function onKey(e) {
  if (document.querySelector(".modal-backdrop")) return;
  if (e.key === "F2") { e.preventDefault(); focusSearch(); }
  else if (e.key === "F4") { e.preventDefault(); startScan(); }
  else if (e.key === "F8") { e.preventDefault(); holdOrder(); }
  else if (e.key === "F9") { e.preventDefault(); openPayment(); }
  else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); focusSearch(); }
}

/* ---------- lifecycle ---------- */
export async function mount(el) {
  root = el;
  el.classList.add("view-pos");
  restore();
  sanitize();
  S.discountOpen = false;

  el.innerHTML = `
  <div class="pos view-enter">
    <section class="pos-catalog">
      <div class="pos-search">
        <div class="search-box big"><span data-icon="search"></span>
          <input id="posSearch" class="input" autocomplete="off" placeholder="Search products, or scan a barcode / QR…  (F2)" /></div>
        <button class="btn btn-outline" id="posScan" style="height:48px;border-radius:14px"><span data-icon="scan"></span> Scan <span class="kbd">F4</span></button>
      </div>
      <div class="chips" id="posCats"></div>
      <div class="product-grid" id="posGrid"></div>
    </section>

    <aside class="pos-cart" id="posCart">
      <div class="cart-head">
        <h3>Current order</h3><span class="count" id="cartCount">0</span>
        <div class="tools">
          <button class="btn btn-sm btn-outline" id="btnHeld" title="Held orders">${icon("list", "sm")} Held <span class="count hidden" id="heldCount" style="background:var(--amber-50);color:#b26a00;padding:0 7px;border-radius:99px;font-weight:800"></span></button>
          <button class="icon-btn bordered" id="btnHold" title="Put order on hold (F8)">${icon("pause")}</button>
          <button class="icon-btn danger bordered" id="btnClear" title="Clear order">${icon("trash")}</button>
          <button class="icon-btn bordered cart-close" id="cartClose" title="Close">${icon("x")}</button>
        </div>
      </div>
      <div class="cart-customer">
        <input class="input input-sm" id="custName" placeholder="Customer name (optional)" autocomplete="off" />
        <input class="input input-sm" id="custPhone" placeholder="Phone" autocomplete="off" inputmode="tel" />
        <input class="input input-sm" id="custAddress" placeholder="Customer address (optional, for GST bills)" autocomplete="street-address" />
      </div>
      <div class="cart-lines" id="cartLines"></div>
      <div class="cart-summary" id="cartSummary"></div>
    </aside>
    <button class="btn btn-primary btn-lg cart-fab" id="cartFab">${icon("cart")} <span id="fabTotal">Cart</span></button>
  </div>`;
  hydrateIcons(el);
  syncInputs();
  renderCats();
  renderGrid();
  renderCart();

  const search = $("#posSearch", el);
  search.addEventListener("input", debounce(() => { S.search = search.value; renderGrid(); }, 80));
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const code = search.value.trim();
    if (!code) return;
    if (/^INV-/i.test(code)) {
      openInvoiceByNo(code).then((found) => {
        if (!found) toast(`Invoice ${code} not found`, "error");
      });
      clearSearch();
      return;
    }
    S.search = code;
    const exact = findByCode(code);
    if (exact) {
      if (addProduct(exact.id)) beep();
      clearSearch();
      return;
    }
    const list = visibleProducts();
    if (list.length === 1) {
      addProduct(list[0].id, { focus: true });
      clearSearch();
    } else if (!list.length) {
      toast(`No product found for "${code}"`, "error");
    }
  });

  $("#posScan", el).onclick = startScan;
  $("#posCats", el).addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    S.category = b.dataset.cat;
    renderCats();
    renderGrid();
  });
  $("#posGrid", el).addEventListener("click", (e) => {
    const card = e.target.closest(".pcard");
    if (card && !card.disabled) {
      addProduct(Number(card.dataset.id), { focus: true });
    }
  });

  $("#custName", el).addEventListener("input", (e) => { S.customer.name = e.target.value; persist(); });
  $("#custPhone", el).addEventListener("input", debounce((e) => {
    S.customer.phone = e.target.value; const raw = e.target.value.replace(/\D/g, "");
    if (raw.length >= 7) {
      const hit = state.sales.find(x => String(x.customerPhone || "").replace(/\D/g, "").slice(-10) === raw.slice(-10) && x.customerName);
      if (hit) { S.customer.name = hit.customerName; $("#custName", el).value = hit.customerName; }
    }
    persist();
  }, 220));
  $("#custAddress", el).addEventListener("input", (e) => { S.customer.address = e.target.value; persist(); });

  const lines = $("#cartLines", el);
  lines.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    const row = e.target.closest(".cline");
    if (!btn || !row) return;
    const pid = Number(row.dataset.id);
    const p = productById(pid);
    const line = S.cart.find((l) => l.productId === pid);
    if (!p || !line) return;
    if (btn.dataset.act === "inc") setQty(pid, line.qty + stepFor(p));
    else if (btn.dataset.act === "dec") setQty(pid, line.qty - stepFor(p));
    else if (btn.dataset.act === "rm") {
      S.cart = S.cart.filter((l) => l.productId !== pid);
      changed();
    }
  });
  lines.addEventListener("change", (e) => {
    if (e.target.dataset.act !== "qty") return;
    const row = e.target.closest(".cline");
    const v = Number(String(e.target.value).replace(",", "."));
    setQty(Number(row.dataset.id), Number.isFinite(v) ? v : 0);
  });
  lines.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.act === "qty") {
      e.preventDefault();
      e.target.blur();
      focusSearch();
    }
  });

  const summary = $("#cartSummary", el);
  summary.addEventListener("click", async (e) => {
    if (e.target.closest("#discToggle")) {
      S.discountOpen = !S.discountOpen;
      renderCart();
    } else if (e.target.closest("#discType button")) {
      const t = e.target.closest("#discType button").dataset.t;
      $$("#discType button", summary).forEach((b) => b.classList.toggle("active", b.dataset.t === t));
    } else if (e.target.closest("#discApply")) {
      const active = $("#discType button.active", summary);
      const type = active ? active.dataset.t : "percent";
      let value = Number($("#discValue", summary).value) || 0;
      if (type === "percent") value = Math.min(value, 100);
      const subtotal = totals().subtotal;
      const minRole = requiredRoleForDiscount(subtotal, type, value);
      if (minRole) {
        try {
          await requestApproval({ action: "Discount", minRole, detail: `${type === "percent" ? value + "%" : money(value)} discount on ${money(subtotal)} subtotal` });
        } catch (err) { return toast(err.message, "warn"); }
      }
      S.discount = value > 0 ? { type, value } : { type: "none", value: 0 };
      S.discountOpen = false;
      changed();
    } else if (e.target.closest("#discRemove")) {
      S.discount = { type: "none", value: 0 };
      S.discountOpen = false;
      changed();
    } else if (e.target.closest("#btnPay")) {
      openPayment();
    }
  });
  summary.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "discValue") $("#discApply", summary).click();
  });

  $("#btnHold", el).onclick = holdOrder;
  $("#btnHeld", el).onclick = openHeld;
  $("#btnClear", el).onclick = async () => {
    if (!cartItems().length) return;
    if (await confirmDialog({ title: "Clear order?", message: "All items will be removed from the current order.", confirmText: "Clear order", danger: true })) {
      resetOrder();
      syncInputs();
      changed();
      focusSearch();
    }
  };
  const cart = $("#posCart", el);
  $("#cartFab", el).onclick = () => cart.classList.add("open");
  $("#cartClose", el).onclick = () => cart.classList.remove("open");

  document.addEventListener("keydown", onKey);
  if (window.innerWidth > 900) focusSearch();
}

/** Called by the app shell after a background sync changed products (e.g. another counter sold something). */
export function refresh() {
  if (!root) return;
  sanitize();
  persist();
  renderCats();
  renderGrid();
  renderCart();
}

export function unmount() {
  document.removeEventListener("keydown", onKey);
  if (root) root.classList.remove("view-pos");
  root = null;
}
