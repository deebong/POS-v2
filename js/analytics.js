// Dashboard numbers, computed in the browser from the synced sales + products.
import { isWeighed, state } from "./store.js";

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function dashboardData() {
  const completed = state.sales.filter((s) => s.status === "completed");

  // Last 14 local days, oldest -> newest
  const keys = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  const buckets = new Map(keys.map((k) => [k, { date: k, revenue: 0, orders: 0, items: 0 }]));
  const weekStart = keys[7];

  const top = new Map();
  const split = {};
  for (const s of completed) {
    const k = dayKey(s.createdAt);
    const b = buckets.get(k);
    if (!b) continue;
    b.revenue += s.total;
    b.orders += 1;
    const inWeek = k >= weekStart;
    if (inWeek) {
      const e = (split[s.paymentMethod] ||= { method: s.paymentMethod, revenue: 0, count: 0 });
      e.revenue += s.total;
      e.count += 1;
    }
    for (const it of state.items.get(s.id) || []) {
      b.items += isWeighed(it.unit) ? 1 : it.qty;
      if (inWeek) {
        const t = top.get(it.name) || { name: it.name, emoji: it.emoji, unit: it.unit, qty: 0, revenue: 0 };
        t.qty += it.qty;
        t.revenue += it.lineSubtotal;
        top.set(it.name, t);
      }
    }
  }

  const all = keys.map((k) => {
    const b = buckets.get(k);
    return { ...b, revenue: r2(b.revenue), items: Math.round(b.items * 100) / 100 };
  });
  const series = all.slice(7);
  const today = all[13];
  const yesterday = all[12];
  const avg = (d) => (d.orders ? r2(d.revenue / d.orders) : 0);

  const active = state.products;
  const lowStock = active
    .filter((p) => p.stock <= p.reorderLevel)
    .sort((a, b) => {
      const ra = a.reorderLevel > 0 ? a.stock / a.reorderLevel : 0;
      const rb = b.reorderLevel > 0 ? b.stock / b.reorderLevel : 0;
      return ra - rb || a.name.localeCompare(b.name);
    })
    .slice(0, 8);

  return {
    today: { revenue: today.revenue, orders: today.orders, items: today.items, avgOrder: avg(today) },
    yesterday: { revenue: yesterday.revenue, orders: yesterday.orders, items: yesterday.items, avgOrder: avg(yesterday) },
    week: {
      revenue: r2(series.reduce((s, d) => s + d.revenue, 0)),
      prevRevenue: r2(all.slice(0, 7).reduce((s, d) => s + d.revenue, 0)),
      orders: series.reduce((s, d) => s + d.orders, 0),
    },
    series,
    topProducts: [...top.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map((t) => ({ ...t, qty: Math.round(t.qty * 100) / 100, revenue: r2(t.revenue) })),
    paymentSplit: Object.values(split).map((e) => ({ ...e, revenue: r2(e.revenue) })),
    lowStock,
    inventory: {
      total: active.length,
      low: active.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel).length,
      out: active.filter((p) => p.stock <= 0).length,
    },
    recent: state.sales.slice(0, 7),
  };
}
