// Loyalty — customer points and member management stored locally on this POS.
import { idb } from "./data/idb.js";
import { state } from "./store.js";
import { recordAudit } from "./audit-log.js";
import { $, $$, esc, hydrateIcons, icon, money, num, openModal, toast } from "./ui.js";

const KEY = "loyalty.v1";
const DEFAULT_RATE = 100;
let root = null;
let query = "";
let config = { earnEvery: DEFAULT_RATE };
let adjustments = {};

const completedSales = () => state.sales.filter((s) => s.status === "completed");
const customerKey = (sale) => String(sale.customerPhone || sale.customerName || "").trim().toLowerCase();
const displayName = (sale) => String(sale.customerName || "Customer").trim() || "Customer";
const displayPhone = (sale) => String(sale.customerPhone || "").trim();
const pointsFromSpend = (spend) => Math.floor((Number(spend) || 0) / Math.max(1, Number(config.earnEvery) || DEFAULT_RATE));

function buildMembers() {
  const map = new Map();
  for (const sale of completedSales()) {
    const key = customerKey(sale);
    if (!key) continue;
    let m = map.get(key);
    if (!m) m = { key, name: displayName(sale), phone: displayPhone(sale), purchases: 0, spend: 0, lastAt: sale.createdAt, sales: [] };
    if (!m.phone) m.phone = displayPhone(sale);
    if (m.name === "Customer" && displayName(sale) !== "Customer") m.name = displayName(sale);
    m.purchases += 1;
    m.spend += Number(sale.total) || 0;
    m.lastAt = new Date(sale.createdAt) > new Date(m.lastAt) ? sale.createdAt : m.lastAt;
    m.sales.push(sale);
    map.set(key, m);
  }
  return [...map.values()].map((m) => {
    const earned = pointsFromSpend(m.spend);
    const adj = Array.isArray(adjustments[m.key]) ? adjustments[m.key] : [];
    const manual = adj.reduce((sum, x) => sum + Number(x.points || 0), 0);
    return { ...m, earned, manual, points: Math.max(0, earned + manual), adjustments: adj };
  }).sort((a, b) => b.points - a.points || b.spend - a.spend || a.name.localeCompare(b.name));
}

function tierFor(spend) {
  const v = Number(spend) || 0;
  if (v >= 30000) return { name: "Platinum", cls: "platinum" };
  if (v >= 15000) return { name: "Gold", cls: "gold" };
  if (v >= 5000) return { name: "Silver", cls: "silver" };
  return { name: "Bronze", cls: "bronze" };
}

function initials(name) {
  return String(name || "Customer").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "C";
}

async function persist() { await idb.set(KEY, { config, adjustments }); }

function memberModal(member) {
  const tier = tierFor(member.spend);
  const ledger = [
    ...member.sales.map((s) => ({ at: s.createdAt, points: pointsFromSpend(s.total), label: `Invoice ${s.invoiceNo}`, detail: money(s.total) })),
    ...member.adjustments.map((x) => ({ at: x.at, points: Number(x.points || 0), label: x.reason || "Manual adjustment", detail: "Manual" })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  const modal = openModal({
    title: esc(member.name), sub: member.phone || "Loyalty member", size: "lg",
    body: `<div class="loyalty-ledger"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px"><div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Points balance</div><b style="font-size:22px">${num(member.points)}</b></div><div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Lifetime spend</div><b style="font-size:22px">${money(member.spend)}</b></div><div class="card" style="padding:14px"><div class="muted" style="font-size:12px">Tier</div><div style="margin-top:7px"><span class="loyalty-tier ${tier.cls}">${tier.name}</span></div></div></div><div class="muted" style="margin:-2px 0 10px">1 point per ₹${num(config.earnEvery)} of completed sales. Manual changes are stored on this POS.</div>${ledger.length ? ledger.slice(0, 100).map((x) => `<div class="loyalty-ledger-row"><div class="detail"><b>${esc(x.label)}</b><span class="date">${esc(new Date(x.at).toLocaleString())} · ${esc(x.detail)}</span></div><span class="value ${x.points >= 0 ? "earn" : "redeem"}">${x.points >= 0 ? "+" : ""}${num(x.points)} pts</span></div>`).join("") : '<div class="loyalty-empty muted">No loyalty activity yet.</div>'}</div>`,
    footer: `<button class="btn btn-outline" data-close>Close</button><button class="btn btn-outline" id="loyaltyRedeem">Redeem points</button><button class="btn btn-primary" id="loyaltyAdjust">Adjust points</button>`,
  });
  const close = modal.foot?.querySelector("[data-close]");
  if (close) close.onclick = () => modal.close();
  modal.$("#loyaltyAdjust").onclick = () => adjustmentModal(member, modal, false);
  modal.$("#loyaltyRedeem").onclick = () => adjustmentModal(member, modal, true);
}

function adjustmentModal(member, parent, redeem) {
  const available = Math.max(0, member.points);
  const m = openModal({
    title: redeem ? "Redeem points" : "Adjust points", sub: esc(member.name),
    body: `<div class="field"><label>Points ${redeem ? `(available: ${available})` : ""}</label><input class="input" id="loyaltyPoints" type="number" min="1" step="1" value="${redeem ? Math.min(available, 100) : 10}" /></div><div class="field" style="margin-top:14px"><label>Reason</label><input class="input" id="loyaltyReason" placeholder="e.g. Welcome bonus / redemption" /></div>`,
    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="loyaltySave">${redeem ? "Redeem" : "Save adjustment"}</button>`,
  });
  m.$("[data-close]").onclick = () => m.close();
  m.$("#loyaltySave").onclick = async () => {
    const points = Math.floor(Number(m.$("#loyaltyPoints").value));
    if (!Number.isFinite(points) || points <= 0) return toast("Enter a valid point amount", "warn");
    if (redeem && points > available) return toast("Not enough points available", "warn");
    const value = redeem ? -points : points;
    const reason = m.$("#loyaltyReason").value.trim() || (redeem ? "Points redeemed" : "Manual points adjustment");
    const list = Array.isArray(adjustments[member.key]) ? adjustments[member.key] : [];
    list.unshift({ at: new Date().toISOString(), points: value, reason });
    adjustments[member.key] = list.slice(0, 200);
    await persist();
    await recordAudit({ action: redeem ? "Redeemed loyalty points" : "Adjusted loyalty points", module: "Loyalty", detail: `${member.name}: ${value > 0 ? "+" : ""}${value} points`, entity: member.phone || member.name });
    m.close(); parent.close(); render(); toast(redeem ? "Points redeemed" : "Points adjusted");
  };
}

function exportCsv() {
  const rows = [["Customer", "Phone", "Tier", "Purchases", "Lifetime spend", "Points"]];
  for (const m of buildMembers()) rows.push([m.name, m.phone, tierFor(m.spend).name, m.purchases, m.spend.toFixed(2), m.points]);
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `freshmart-loyalty-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function render() {
  if (!root || !root.isConnected) return;
  const all = buildMembers();
  const q = query.trim().toLowerCase();
  const list = all.filter((m) => !q || [m.name, m.phone].join(" ").toLowerCase().includes(q));
  const totalPoints = all.reduce((sum, m) => sum + m.points, 0);
  const totalSpend = all.reduce((sum, m) => sum + m.spend, 0);
  const goldPlus = all.filter((m) => ["Gold", "Platinum"].includes(tierFor(m.spend).name)).length;
  root.innerHTML = `<div class="view-enter loyalty-page"><div class="loyalty-toolbar"><div class="loyalty-copy">Customer rewards, points balances and loyalty activity.</div><div class="actions"><button class="btn btn-outline" id="loyaltyExport">${icon("download")} Export CSV</button></div></div><div class="loyalty-stats"><div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("user", "lg")}</span>Loyalty members</div><div class="stat-value">${all.length}</div><div class="stat-foot">Customers with completed purchases</div></div><div class="card stat"><div class="stat-top"><span class="stat-icon green">${icon("receipt", "lg")}</span>Points outstanding</div><div class="stat-value">${num(totalPoints)}</div><div class="stat-foot">1 point per ₹${num(config.earnEvery)}</div></div><div class="card stat"><div class="stat-top"><span class="stat-icon violet">${icon("dollar", "lg")}</span>Member spend</div><div class="stat-value">${money(totalSpend)}</div><div class="stat-foot">Completed customer sales</div></div><div class="card stat"><div class="stat-top"><span class="stat-icon orange">${icon("user", "lg")}</span>Gold & above</div><div class="stat-value">${goldPlus}</div><div class="stat-foot">Based on lifetime spend</div></div></div><section class="card mt-16 loyalty-card"><div class="card-head"><div><h3>Loyalty members</h3><div class="sub">Points are calculated from completed customer sales and local adjustments.</div></div></div><div class="loyalty-settings"><div class="loyalty-settings-copy"><b>Earn rate</b><span>How much a customer spends to earn one point.</span></div><div class="loyalty-rate"><span>₹</span><input class="input" id="loyaltyRate" type="number" min="1" step="1" value="${num(config.earnEvery)}" /><span>per point</span><button class="btn btn-sm btn-primary" id="loyaltyRateSave">Save</button></div></div><div class="loyalty-filters"><div class="loyalty-search"><span class="loyalty-search-icon">${icon("search", "sm")}</span><input class="input" id="loyaltySearch" placeholder="Search customer name or phone..." value="${esc(query)}" /></div><div class="summary-line"><span><b>${list.length}</b> members</span></div></div><div class="table-wrap loyalty-table"><table class="table"><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>TIER</th><th class="num">PURCHASES</th><th class="num">SPEND</th><th class="num">POINTS</th><th>LAST PURCHASE</th><th></th></tr></thead><tbody>${list.length ? list.map((m) => { const tier = tierFor(m.spend); return `<tr><td><div class="loyalty-member-name"><span class="loyalty-avatar">${esc(initials(m.name))}</span><b>${esc(m.name)}</b></div></td><td>${m.phone ? `<span class="mono">${esc(m.phone)}</span>` : '<span class="muted">—</span>'}</td><td><span class="loyalty-tier ${tier.cls}">${tier.name}</span></td><td class="num">${num(m.purchases)}</td><td class="num"><b>${money(m.spend)}</b></td><td class="num"><span class="loyalty-points">${num(m.points)}</span></td><td class="nowrap">${esc(new Date(m.lastAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</td><td><button class="btn btn-sm btn-soft" data-member="${esc(m.key)}">View</button></td></tr>`; }).join("") : `<tr><td colspan="8"><div class="empty"><div class="big">${icon("user")}</div><h4>No loyalty members found</h4><p>Use a customer name or phone number during checkout to build the member directory.</p></div></td></tr>`}</tbody></table></div></section></div>`;
  hydrateIcons(root);
  $("#loyaltySearch", root).oninput = (e) => { query = e.target.value; render(); const input = $("#loyaltySearch", root); input?.focus(); input?.setSelectionRange(query.length, query.length); };
  $("#loyaltyExport", root).onclick = exportCsv;
  $("#loyaltyRateSave", root).onclick = async () => { const rate = Math.max(1, Math.floor(Number($("#loyaltyRate", root).value))); config.earnEvery = Number.isFinite(rate) ? rate : DEFAULT_RATE; await persist(); render(); toast(`Earn rate saved: 1 point per ₹${config.earnEvery}`); };
  $$("[data-member]", root).forEach((b) => b.onclick = () => { const member = buildMembers().find((m) => m.key === b.dataset.member); if (member) memberModal(member); });
}

export async function mount(el) { root = el; const saved = await idb.get(KEY).catch(() => null); config = { earnEvery: Number(saved?.config?.earnEvery) || DEFAULT_RATE }; adjustments = saved?.adjustments && typeof saved.adjustments === "object" ? saved.adjustments : {}; render(); }
export function refresh() { render(); }
export function unmount() { root = null; }
window.addEventListener("data:changed", () => { if (root?.isConnected) render(); });
