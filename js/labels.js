// QR label generator / printer
import { qrUrl } from "./qr.js";
import { catTint, categoryCounts, state } from "./store.js";
import { $, $$, debounce, esc, hydrateIcons, icon, money, num, printHtml, toast } from "./ui.js";

export const LABEL_SIZES = {
  sm: "Compact · 46 × 22 mm",
  md: "Standard · 62 × 32 mm",
  lg: "Large · 90 × 50 mm",
};

/** items: [{ product, copies }] */
export function labelSheetHtml(items, { size = "md", showPrice = true } = {}) {
  const cells = [];
  for (const { product: p, copies } of items) {
    for (let i = 0; i < copies; i++) {
      cells.push(`
      <div class="plabel sz-${size}">
        <img alt="QR ${esc(p.sku)}" src="${qrUrl(p.sku, { format: "svg" })}" />
        <div class="txt">
          <div class="n">${esc(p.name)}</div>
          <div class="s">${esc(p.sku)}</div>
          ${showPrice ? `<div class="p">${money(p.price)}<span style="font-size:.55em;font-weight:600"> /${esc(p.unit)}</span></div>` : ""}
        </div>
      </div>`);
    }
  }
  return `<div class="label-sheet">${cells.join("")}</div>`;
}

export function printLabels(items, opts) {
  const total = items.reduce((s, i) => s + i.copies, 0);
  if (!total) return toast("Select at least one product", "warn");
  printHtml(labelSheetHtml(items, opts));
}

export function refresh() {
  /* keep the current selection during background syncs */
}

export async function mount(el) {
  const F = { search: "", category: "all", size: "md", copies: 1, showPrice: true };
  const selected = new Set();

  el.innerHTML = `
  <div class="view-enter">
    <div class="page-head">
      <div><h2>QR Labels</h2><p>Print shelf & package labels. Each QR encodes the product SKU — scan it at the POS to add the item instantly.</p></div>
      <div class="actions"><button class="btn btn-primary" id="lPrint">${icon("printer")} <span id="lPrintText">Print labels</span></button></div>
    </div>
    <div class="card">
      <div class="label-toolbar">
        <div class="field" style="flex:1;min-width:200px"><label>Search</label>
          <div class="search-box"><span data-icon="search"></span><input class="input" id="lSearch" placeholder="Name or SKU…" /></div></div>
        <div class="field"><label>Category</label><select class="select" id="lCat"></select></div>
        <div class="field"><label>Label size</label><select class="select" id="lSize">${Object.entries(LABEL_SIZES)
          .map(([k, v]) => `<option value="${k}" ${k === "md" ? "selected" : ""}>${v}</option>`)
          .join("")}</select></div>
        <div class="field" style="width:96px"><label>Copies</label><input class="input" id="lCopies" type="number" min="1" max="50" value="1" /></div>
        <div class="field"><label>Show price</label><label class="switch" style="margin-top:8px"><input type="checkbox" id="lPrice" checked /><span></span></label></div>
        <div style="display:flex;gap:8px;margin-left:auto">
          <button class="btn btn-outline" id="lAll">Select all</button>
          <button class="btn btn-ghost" id="lNone">Clear</button>
        </div>
      </div>
      <div class="label-grid" id="lGrid"></div>
    </div>
  </div>`;
  hydrateIcons(el);

  const cat = $("#lCat", el);
  cat.innerHTML =
    `<option value="all">All categories</option>` + categoryCounts().map(([c]) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

  const visible = () => {
    const q = F.search.toLowerCase();
    return state.products.filter(
      (p) => (F.category === "all" || p.category === F.category) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  };

  function updatePrintBtn() {
    const n = selected.size * F.copies;
    $("#lPrintText", el).textContent = selected.size ? `Print ${n} label${n > 1 ? "s" : ""}` : "Print labels";
  }

  function render() {
    const list = visible();
    $("#lGrid", el).innerHTML = list.length
      ? list
          .map(
            (p) => `
      <div class="label-card ${selected.has(p.id) ? "selected" : ""}" data-id="${p.id}">
        <span class="chk">${icon("check")}</span>
        <img loading="lazy" alt="QR for ${esc(p.sku)}" src="${qrUrl(p.sku, { format: "svg" })}" />
        <div class="nm">${esc(p.emoji)} ${esc(p.name)}</div>
        <div class="sk">${esc(p.sku)}</div>
        <div class="pr">${money(p.price)}<span class="muted" style="font-size:12px;font-weight:600"> /${esc(p.unit)}</span></div>
      </div>`,
          )
          .join("")
      : `<div class="empty" style="grid-column:1/-1"><div class="big">🏷️</div><h4>No products match</h4></div>`;
    updatePrintBtn();
  }

  $("#lGrid", el).addEventListener("click", (e) => {
    const card = e.target.closest(".label-card");
    if (!card) return;
    const id = Number(card.dataset.id);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    card.classList.toggle("selected", selected.has(id));
    updatePrintBtn();
  });
  $("#lSearch", el).addEventListener("input", debounce((e) => { F.search = e.target.value.trim(); render(); }, 150));
  cat.onchange = () => { F.category = cat.value; render(); };
  $("#lSize", el).onchange = (e) => { F.size = e.target.value; };
  $("#lCopies", el).oninput = (e) => {
    F.copies = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 50);
    updatePrintBtn();
  };
  $("#lPrice", el).onchange = (e) => { F.showPrice = e.target.checked; };
  $("#lAll", el).onclick = () => { visible().forEach((p) => selected.add(p.id)); render(); };
  $("#lNone", el).onclick = () => { selected.clear(); render(); };
  $("#lPrint", el).onclick = () => {
    const items = state.products.filter((p) => selected.has(p.id)).map((p) => ({ product: p, copies: F.copies }));
    printLabels(items, { size: F.size, showPrice: F.showPrice });
  };
  render();
  $$(".label-card", el);
}
