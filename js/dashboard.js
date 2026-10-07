// Dashboard: KPIs, sales chart, payment split, top products, low stock, recent invoices
import { dashboardData } from "./analytics.js";
import { mediaHtml } from "./media.js";
import { getConfig } from "./data/backend.js";
import { openProductForm, openStockModal } from "./inventory.js";
import { openInvoiceById } from "./sales.js";
import { state } from "./store.js";
import { $, $$, esc, hydrateIcons, icon, methodBadge, methodLabel, money, num, fmtTime } from "./ui.js";

function delta(cur, prev) {
  if (!prev) return cur > 0 ? `<span class="delta up">${icon("up", "sm")} New</span>` : `<span class="delta flat">—</span>`;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return `<span class="delta flat">0%</span>`;
  return `<span class="delta ${pct > 0 ? "up" : "down"}">${icon(pct > 0 ? "up" : "down", "sm")} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const dayLabel = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
};
const dayLong = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

function niceMax(v) {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}
const short = (n) => (n >= 1000 ? `${state.settings.currency}${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `${state.settings.currency}${Math.round(n)}`);

function chartHtml(series) {
  const max = niceMax(Math.max(...series.map((d) => d.revenue), 0));
  const lines = [1, 0.75, 0.5, 0.25, 0].map((f) => `<div><span>${short(max * f)}</span></div>`).join("");
  const cols = series
    .map((d, i) => {
      const pct = Math.max((d.revenue / max) * 100, d.revenue > 0 ? 2 : 0);
      return `
      <div class="chart-col ${i === series.length - 1 ? "today" : ""}">
        <div class="chart-area">
          <div class="chart-tip" style="bottom:calc(${pct}% + 8px)"><b>${money(d.revenue)}</b>${d.orders} orders · ${esc(dayLong(d.date))}</div>
          <div class="chart-bar" style="height:${pct}%;animation-delay:${i * 50}ms"></div>
        </div>
        <div class="chart-lbl">${i === series.length - 1 ? "Today" : dayLabel(d.date)}</div>
      </div>`;
    })
    .join("");
  return `<div class="chart"><div class="chart-grid">${lines}</div><div class="chart-cols">${cols}</div></div>`;
}

const METHOD_COLORS = { cash: "#0f9d58", card: "#3b82f6", upi: "#7c5cfc" };

function donutHtml(split) {
  const total = split.reduce((s, x) => s + x.revenue, 0);
  const orders = split.reduce((s, x) => s + x.count, 0);
  if (!total) return `<div class="empty"><div class="big">💳</div><p>No payments yet</p></div>`;
  let acc = 0;
  const stops = split
    .map((x) => {
      const from = (acc / total) * 100;
      acc += x.revenue;
      return `${METHOD_COLORS[x.method] || "#94a3b8"} ${from}% ${(acc / total) * 100}%`;
    })
    .join(", ");
  return `
  <div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(${stops})"><div class="donut-center"><div><b>${orders}</b><br><span>orders</span></div></div></div>
    <div class="legend">${split
      .sort((a, b) => b.revenue - a.revenue)
      .map(
        (x) => `<div class="legend-row"><span class="legend-dot" style="background:${METHOD_COLORS[x.method] || "#94a3b8"}"></span>
          <span class="nm">${esc(methodLabel(x.method))}</span><span class="pc">${Math.round((x.revenue / total) * 100)}%</span><span class="vl">${money(x.revenue)}</span></div>`,
      )
      .join("")}</div>
  </div>`;
}

export async function mount(el) {
  el.innerHTML = `<div class="view-enter"><div class="empty" style="padding:80px 0"><p>Loading dashboard…</p></div></div>`;
  let d;
  try {
    d = dashboardData();
  } catch (e) {
    el.innerHTML = `<div class="empty"><h4>Couldn't load dashboard</h4><p>${esc(e.message)}</p></div>`;
    return;
  }
  const weekDelta = delta(d.week.revenue, d.week.prevRevenue);
  const maxTop = Math.max(...d.topProducts.map((t) => t.revenue), 1);

  el.innerHTML = `
  <div class="view-enter">
    <div class="page-head">
      <div><h2>${greeting()}, Alex 👋</h2><p>Here's how ${esc(state.settings.storeName)} is doing today.</p></div>
      <div class="actions">
        <button class="btn btn-outline" id="dAdd">${icon("plus")} Add product</button>
        <a class="btn btn-primary" href="#/pos">${icon("cart")} New sale</a>
      </div>
    </div>

    ${getConfig().mode !== "local" || localStorage.getItem("pos.hideLocalTip") ? "" : `<div class="callout" id="localTip"><span class="callout-ic">${icon("monitor", "lg")}</span><div><b>Data is stored on this PC only.</b> It works fully offline. Connect a Google Sheet to back it up and sync between counters — the POS keeps working offline either way.</div><a class="btn btn-sm btn-primary" href="#/settings">Connect Google Sheets</a><button class="icon-btn" id="hideTip" title="Hide">${icon("x", "sm")}</button></div>`}
    <div class="stat-grid">
      <div class="card stat"><div class="stat-top"><span class="stat-icon green">${icon("dollar", "lg")}</span>Today's revenue</div>
        <div class="stat-value">${money(d.today.revenue)}</div><div class="stat-foot">${delta(d.today.revenue, d.yesterday.revenue)} vs yesterday (${money(d.yesterday.revenue)})</div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("receipt", "lg")}</span>Orders</div>
        <div class="stat-value">${num(d.today.orders)}</div><div class="stat-foot">${delta(d.today.orders, d.yesterday.orders)} vs yesterday (${d.yesterday.orders})</div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon violet">${icon("bag", "lg")}</span>Items sold</div>
        <div class="stat-value">${num(d.today.items, 0)}</div><div class="stat-foot">${delta(d.today.items, d.yesterday.items)} vs yesterday (${num(d.yesterday.items, 0)})</div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon amber">${icon("tag", "lg")}</span>Avg. order value</div>
        <div class="stat-value">${money(d.today.avgOrder)}</div><div class="stat-foot">${delta(d.today.avgOrder, d.yesterday.avgOrder)} vs yesterday (${money(d.yesterday.avgOrder)})</div></div>
    </div>

    <div class="card profit-summary-card mt-16"><div class="card-head"><div><h3>Gross profit</h3><div class="sub">Sold price after discounts minus captured product cost</div></div><a class="btn btn-sm btn-ghost" href="#/reports">Detailed reports</a></div><div class="profit-periods"><div><span>Today</span><b>${money(d.profit.today)}</b></div><div><span>Last 7 days</span><b>${money(d.profit.week)}</b></div><div><span>Last 30 days</span><b>${money(d.profit.month)}</b></div></div></div>

    <div class="grid-2-1 mt-16">
      <div class="card">
        <div class="card-head"><div><h3>Sales overview</h3><div class="sub">Revenue · last 7 days</div></div>
          <div class="right-slot" style="text-align:right"><div style="font-size:20px;font-weight:800">${money(d.week.revenue)}</div><div class="sub">${weekDelta} vs prior week</div></div></div>
        <div class="card-body">${chartHtml(d.series)}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Payment methods</h3><div class="sub">Last 7 days</div></div></div>
        <div class="card-body">${donutHtml(d.paymentSplit)}</div>
      </div>
    </div>

    <div class="grid-3 mt-16">
      <div class="card">
        <div class="card-head"><div><h3>Top products</h3><div class="sub">By revenue · 7 days</div></div></div>
        <div class="card-body"><div class="list">${
          d.topProducts.length
            ? d.topProducts
                .map(
                  (t, i) => `<div class="list-row"><span class="rank ${i === 0 ? "r1" : ""}">${i + 1}</span><span class="thumb" style="width:36px;height:36px;font-size:19px">${mediaHtml(state.all.find((x) => x.name === t.name) || t)}</span>
              <div class="grow"><div class="t">${esc(t.name)}</div><div class="hbar"><i style="width:${(t.revenue / maxTop) * 100}%"></i></div></div>
              <div style="text-align:right"><b>${money(t.revenue)}</b><div class="s">${num(t.qty, 1)} ${esc(t.unit)}</div></div></div>`,
                )
                .join("")
            : '<div class="empty"><p>No sales yet</p></div>'
        }</div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Low stock alerts</h3><div class="sub">${d.inventory.low} low · ${d.inventory.out} out of stock</div></div>
          <a class="btn btn-sm btn-ghost right-slot" href="#/inventory">View all</a></div>
        <div class="card-body"><div class="list">${
          d.lowStock.length
            ? d.lowStock
                .map(
                  (p) => `<div class="list-row" data-pid="${p.id}"><span class="thumb" style="width:36px;height:36px;font-size:19px;background:${p.stock <= 0 ? "var(--red-50)" : "var(--amber-50)"}">${mediaHtml(p)}</span>
              <div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${p.stock <= 0 ? '<span style="color:var(--red);font-weight:700">Out of stock</span>' : `<b>${num(p.stock)}</b> ${esc(p.unit)} left`} · reorder at ${num(p.reorderLevel)}</div></div>
              <button class="btn btn-sm btn-soft" data-restock>${icon("plus", "sm")} Restock</button></div>`,
                )
                .join("")
            : '<div class="empty"><div class="big">✅</div><p>All products are well stocked</p></div>'
        }</div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Recent transactions</h3><div class="sub">Latest invoices</div></div>
          <a class="btn btn-sm btn-ghost right-slot" href="#/sales">View all</a></div>
        <div class="card-body"><div class="list">${
          d.recent.length
            ? d.recent
                .map(
                  (s) => `<div class="list-row" data-sid="${s.id}" style="cursor:pointer">
              <div class="grow"><div class="t mono">${esc(s.invoiceNo)}</div><div class="s">${esc(fmtTime(s.createdAt))} · ${s.itemCount} items</div></div>
              ${methodBadge(s.paymentMethod)}<b style="min-width:64px;text-align:right${s.status === "voided" ? ";text-decoration:line-through;color:var(--muted)" : ""}">${money(s.total)}</b></div>`,
                )
                .join("")
            : '<div class="empty"><p>No transactions yet</p></div>'
        }</div></div>
      </div>
    </div>
  </div>`;
  hydrateIcons(el);

  const hide = $("#hideTip", el);
  if (hide) hide.onclick = () => { localStorage.setItem("pos.hideLocalTip", "1"); $("#localTip", el).remove(); };
  $("#dAdd", el).onclick = () => openProductForm(null, { onSaved: () => mount(el) });
  $$("[data-restock]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const pid = Number(b.closest("[data-pid]").dataset.pid);
      const p = state.all.find((x) => x.id === pid);
      if (p) openStockModal(p, { onSaved: () => mount(el) });
    }),
  );
  $$("[data-sid]", el).forEach((r) => r.addEventListener("click", () => openInvoiceById(Number(r.dataset.sid), { onChange: () => mount(el) })));
}
