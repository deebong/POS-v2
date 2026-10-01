// Low Stock — reorder alerts and stock exceptions.
import { refreshData, state, stockStatus } from "./store.js";
import { openStockModal } from "./inventory.js";
import { recordAudit } from "./audit-log.js";
import { $, $$, esc, hydrateIcons, icon, money, num, toast } from "./ui.js";

let root = null;
let query = "";
let filter = "all";

const statusLabel = (status) => status === "out" ? "Out of stock" : status === "low" ? "Low stock" : "In stock";
const attention = () => state.all.filter((p) => p.isActive && stockStatus(p) !== "ok");

function rows() {
  const q = query.trim().toLowerCase();
  return attention()
    .filter((p) => filter === "all" || stockStatus(p) === filter)
    .filter((p) => !q || [p.name, p.sku, p.category].join(" ").toLowerCase().includes(q))
    .sort((a, b) => {
      const sa = stockStatus(a), sb = stockStatus(b);
      if (sa !== sb) return sa === "out" ? -1 : 1;
      const ga = Math.max(0, Number(a.reorderLevel || 0) - Number(a.stock || 0));
      const gb = Math.max(0, Number(b.reorderLevel || 0) - Number(b.stock || 0));
      return gb - ga || a.name.localeCompare(b.name);
    });
}

function render() {
  if (!root || !root.isConnected) return;
  const products = attention();
  const out = products.filter((p) => stockStatus(p) === "out");
  const low = products.filter((p) => stockStatus(p) === "low");
  const reorderValue = products.reduce((sum, p) => sum + Math.max(0, Number(p.reorderLevel || 0) - Number(p.stock || 0)) * Number(p.cost || 0), 0);
  const list = rows();

  root.innerHTML = `
    <div class="view-enter low-stock-page">
      <div class="low-stock-toolbar">
        <div class="low-stock-copy">Products at or below their reorder level.</div>
        <div class="actions">
          <button class="btn btn-outline" id="lowRefresh">${icon("refresh")} Refresh</button>
          <button class="btn btn-outline" id="lowExport">${icon("download")} Export CSV</button>
          <a class="btn btn-primary" href="#/inventory">${icon("package")} Inventory</a>
        </div>
      </div>

      <div class="low-stock-stats">
        <div class="card stat"><div class="stat-top"><span class="stat-icon orange">${icon("alert", "lg")}</span>Needs reorder</div><div class="stat-value">${products.length}</div><div class="stat-foot">Active products needing attention</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon red">${icon("package", "lg")}</span>Out of stock</div><div class="stat-value">${out.length}</div><div class="stat-foot">Unavailable at the POS</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("clock", "lg")}</span>Low stock</div><div class="stat-value">${low.length}</div><div class="stat-foot">Still selling, but below level</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon violet">${icon("receipt", "lg")}</span>Gap value</div><div class="stat-value">${money(reorderValue)}</div><div class="stat-foot">Cost to reach reorder levels</div></div>
      </div>

      <section class="card mt-16 low-stock-card">
        <div class="card-head low-stock-head">
          <div><h3>Reorder alerts</h3><div class="sub">Review stock exceptions and replenish products before they run out.</div></div>
        </div>
        <div class="low-stock-filters">
          <div class="low-search"><span>${icon("search", "sm")}</span><input class="input" id="lowSearch" placeholder="Search product, SKU or category..." value="${esc(query)}" /></div>
          <div class="low-chips" role="tablist" aria-label="Stock status">
            <button class="low-chip ${filter === "all" ? "active" : ""}" data-filter="all">All <span>${products.length}</span></button>
            <button class="low-chip ${filter === "out" ? "active" : ""}" data-filter="out">Out of stock <span>${out.length}</span></button>
            <button class="low-chip ${filter === "low" ? "active" : ""}" data-filter="low">Low stock <span>${low.length}</span></button>
          </div>
        </div>
        <div class="table-wrap low-stock-table"><table class="table"><thead><tr><th>PRODUCT</th><th>STOCK</th><th>REORDER LEVEL</th><th>BELOW LEVEL</th><th>COST VALUE</th><th>STATUS</th><th></th></tr></thead><tbody>
          ${list.length ? list.map((p) => {
            const status = stockStatus(p);
            const gap = Math.max(0, Number(p.reorderLevel || 0) - Number(p.stock || 0));
            const value = gap * Number(p.cost || 0);
            return `<tr>
              <td><div class="low-product"><span class="low-product-icon">${esc(p.emoji || "🛒")}</span><div><b>${esc(p.name)}</b><div class="muted">${esc(p.sku)} · ${esc(p.category || "Uncategorised")}</div></div></div></td>
              <td><b class="${status === "out" ? "low-danger" : ""}">${num(p.stock)} ${esc(p.unit)}</b></td>
              <td>${num(p.reorderLevel)} ${esc(p.unit)}</td>
              <td><b>${num(gap)} ${esc(p.unit)}</b></td>
              <td>${money(value)}</td>
              <td><span class="low-status ${status}"><span></span>${statusLabel(status)}</span></td>
              <td><button class="btn btn-sm btn-outline low-restock" data-id="${esc(p.id)}">${icon("plus", "sm")} Restock</button></td>
            </tr>`;
          }).join("") : `<tr><td colspan="7"><div class="empty"><div class="big">${icon("check")}</div><h4>No products need attention</h4><p>All active products are above their reorder levels.</p></div></td></tr>`}
        </tbody></table></div>
      </section>
    </div>`;

  hydrateIcons(root);
  $("#lowSearch", root).oninput = (e) => { query = e.target.value; render(); const input = $("#lowSearch", root); input?.focus(); input?.setSelectionRange(query.length, query.length); };
  $$(".low-chip", root).forEach((b) => b.onclick = () => { filter = b.dataset.filter; render(); });
  $$(".low-restock", root).forEach((b) => b.onclick = () => {
    const p = state.all.find((x) => String(x.id) === String(b.dataset.id));
    if (!p) return;
    openStockModal(p, { onSaved: async (updated) => {
      await recordAudit({ action: "Adjusted stock", module: "Low Stock", detail: `${p.name}: ${num(updated?.stock ?? p.stock)} ${p.unit}`, entity: p.sku });
      render();
    }});
  });
  $("#lowRefresh", root).onclick = async () => {
    const btn = $("#lowRefresh", root); if (btn) { btn.disabled = true; btn.innerHTML = `${icon("refresh")} Refreshing…`; hydrateIcons(btn); }
    try { await refreshData(); toast("Stock levels refreshed"); } catch (e) { toast(e.message, "error"); }
    render();
  };
  $("#lowExport", root).onclick = exportCsv;
}

function exportCsv() {
  const list = rows();
  const escCsv = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [["Product", "SKU", "Category", "Stock", "Unit", "Reorder level", "Below level", "Cost value", "Status"], ...list.map((p) => {
    const gap = Math.max(0, Number(p.reorderLevel || 0) - Number(p.stock || 0));
    return [p.name, p.sku, p.category, p.stock, p.unit, p.reorderLevel, gap, gap * Number(p.cost || 0), statusLabel(stockStatus(p))];
  })].map((r) => r.map(escCsv).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `freshmart-low-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function mount(el) { root = el; render(); }
export function refresh() { render(); }
export function unmount() { root = null; }

window.addEventListener("data:changed", () => { if (root?.isConnected) render(); });
