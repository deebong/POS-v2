// Audit Log — local activity history for this POS terminal.
// Audit records stay on this PC because they describe local operator activity.
import { idb } from "./data/idb.js";
import { $, esc, hydrateIcons, icon, money, toast } from "./ui.js";
import { currentStaff } from "./staff.js";
import { backend, getConfig } from "./data/backend.js";

const KEY = "audit.log.v1";
const MAX_RECORDS = 1000;
const COUNTER = "Counter 1";

let records = [];
let root = null;
let filter = "";
let actionFilter = "all";

const now = () => new Date().toISOString();
const fmt = (iso) => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const escCsv = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const textHash = async (value) => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join(""); };
const canonical = (r) => [r.id,r.at,r.actor,r.counter,r.action,r.module,r.detail,r.entity,r.level,r.prevHash || ""].join("\n");

export async function recordAudit({ action, module = "System", detail = "", entity = "", level = "info" } = {}) {
  if (!action) return;
  const item = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: now(),
    actor: currentStaff()?.name || "Unknown operator",
    counter: COUNTER,
    action: String(action),
    module: String(module),
    detail: String(detail || ""),
    entity: String(entity || ""),
    level: String(level || "info"),
  };
  records.unshift(item);
  records = records.slice(0, MAX_RECORDS);
  try { void idb.set(KEY, { records }).catch(() => {}); } catch { /* Audit logging must never block POS actions. */ }
  window.dispatchEvent(new CustomEvent("audit:changed"));
  return item;
}

async function load() {
  const saved = await idb.get(KEY).catch(() => null);
  records = Array.isArray(saved?.records) ? saved.records : [];
  records.sort((a, b) => new Date(b.at) - new Date(a.at));
}

function filtered() {
  const q = filter.trim().toLowerCase();
  return records.filter((r) => {
    if (actionFilter !== "all" && r.action !== actionFilter) return false;
    if (!q) return true;
    return [r.action, r.module, r.detail, r.entity, r.actor, r.counter].join(" ").toLowerCase().includes(q);
  });
}

function actions() {
  return [...new Set(records.map((r) => r.action).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function render() {
  if (!root || !root.isConnected) return;
  const rows = filtered();
  const actor = currentStaff()?.name || "Unknown operator";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const todayCount = records.filter((r) => {
    const d = new Date(r.at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayKey;
  }).length;
  const critical = records.filter((r) => r.level === "warn" || r.level === "danger").length;

  root.innerHTML = `
    <div class="view-enter audit-page">
      <div class="audit-toolbar">
        <div class="audit-toolbar-copy">Operator activity and important POS actions recorded on this terminal.</div>
        <div class="actions"><button class="btn btn-outline" id="auditExport">${icon("download")} Export CSV</button><button class="btn btn-outline" id="auditClear">${icon("trash")} Clear log</button></div>
      </div>
      <div class="audit-stats">
        <div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("list", "lg")}</span>Total events</div><div class="stat-value">${records.length}</div><div class="stat-foot">Maximum ${MAX_RECORDS} events retained</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon green">${icon("clock", "lg")}</span>Today</div><div class="stat-value">${todayCount}</div><div class="stat-foot">Events recorded today</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon violet">${icon("user", "lg")}</span>Operator</div><div class="stat-value audit-operator">${esc(actor)}</div><div class="stat-foot">${esc(COUNTER)}</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon orange">${icon("alert", "lg")}</span>Attention</div><div class="stat-value">${critical}</div><div class="stat-foot">Warnings or critical events</div></div>
      </div>
      <section class="card mt-16 audit-card">
        <div class="card-head"><div><h3>Activity history</h3><div class="sub">Recent actions performed on this POS terminal.</div></div></div>
        <div class="audit-filters"><div class="audit-search"><span class="audit-search-icon">${icon("search", "sm")}</span><input class="input" id="auditSearch" placeholder="Search actions, modules or details..." value="${esc(filter)}" /></div><select class="input audit-action" id="auditAction"><option value="all">All actions</option>${actions().map((a) => `<option value="${esc(a)}" ${a === actionFilter ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></div>
        <div class="table-wrap audit-table"><table class="table"><thead><tr><th>TIME</th><th>ACTION</th><th>MODULE</th><th>DETAIL</th><th>OPERATOR</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td class="nowrap">${esc(fmt(r.at))}</td><td><span class="audit-action-badge ${esc(r.level)}">${esc(r.action)}</span></td><td>${esc(r.module)}</td><td>${esc(r.detail || r.entity || "—")}</td><td><b>${esc(r.actor)}</b><div class="muted">${esc(r.counter)}</div></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty"><div class="big">${icon("list")}</div><h4>No audit events found</h4><p>Actions performed on this terminal will appear here.</p></div></td></tr>`}</tbody></table></div>
      </section>
    </div>`;
  hydrateIcons(root);
  $("#auditSearch", root).oninput = (e) => { filter = e.target.value; render(); const input = $("#auditSearch", root); if (input) { input.focus(); input.setSelectionRange(filter.length, filter.length); } };
  $("#auditAction", root).onchange = (e) => { actionFilter = e.target.value; render(); };
  $("#auditExport", root).onclick = exportCsv;
  $("#auditClear", root).onclick = clearLog;
}

function exportCsv() {
  const rows = filtered();
  const csv = [["Time", "Action", "Module", "Detail", "Entity", "Operator", "Counter", "Level"], ...rows.map((r) => [r.at, r.action, r.module, r.detail, r.entity, r.actor, r.counter, r.level])].map((r) => r.map(escCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `freshmart-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function clearLog() {
  if (!records.length) return toast("Audit log is already empty", "warn");
  if (!confirm("Clear all audit log entries stored on this PC?")) return;
  records = [];
  await idb.set(KEY, { records });
  render();
  toast("Audit log cleared");
}

export async function mount(el) {
  root = el;
  await load();
  render();
}

export function refresh() { load().then(render); }
export function unmount() { root = null; }

window.addEventListener("audit:changed", () => {
  if (root && root.isConnected) load().then(render);
});
