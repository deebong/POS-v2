// Cash Drawer — counter-local drawer sessions and cash movements.
// Drawer state is intentionally stored in IndexedDB on this PC because it represents the physical
// cash drawer attached to this counter. Sales remain the source of truth for cash-sale inflows.
import { idb } from "./data/idb.js";
import { state } from "./store.js";
import { $, $$, esc, hydrateIcons, icon, money, openModal, toast } from "./ui.js";

const KEY = "cash.drawer.v1";
const CASHIER = "Anand";
const COUNTER = "Counter 1";
let db = { active: null, sessions: [], movements: [] };
let ready = null;
let elRef = null;
let timer = null;

const now = () => new Date().toISOString();
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const round = (v) => Math.round(n(v) * 100) / 100;
const money0 = (v) => money(round(v));

async function load() {
  if (!ready) ready = idb.get(KEY).then((v) => {
    db = { active: null, sessions: [], movements: [], ...(v || {}) };
    if (!Array.isArray(db.sessions)) db.sessions = [];
    if (!Array.isArray(db.movements)) db.movements = [];
    return db;
  });
  return ready;
}
async function save() {
  await idb.set(KEY, db);
}

function sessionSales(session) {
  if (!session) return [];
  const from = new Date(session.openedAt).getTime();
  return state.sales.filter((s) => {
    const t = new Date(s.createdAt).getTime();
    return t >= from && (!session.closedAt || t <= new Date(session.closedAt).getTime()) && s.status === "completed" && s.paymentMethod === "cash";
  });
}
function cashSales(session) { return sessionSales(session).reduce((sum, s) => sum + n(s.total), 0); }
function cashIn(session) { return db.movements.filter((m) => m.sessionId === session?.id && m.type === "in").reduce((s, m) => s + n(m.amount), 0); }
function cashOut(session) { return db.movements.filter((m) => m.sessionId === session?.id && m.type === "out").reduce((s, m) => s + n(m.amount), 0); }
function expected(session) { return session ? round(n(session.openingFloat) + cashSales(session) + cashIn(session) - cashOut(session)) : 0; }
function statusLabel() { return db.active ? "Open" : "Closed"; }
function sessionDuration(session) {
  if (!session) return "—";
  const ms = Math.max(0, (session.closedAt ? new Date(session.closedAt) : new Date()) - new Date(session.openedAt));
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; }

function render() {
  if (!elRef) return;
  const active = db.active;
  const sales = active ? sessionSales(active) : [];
  const salesTotal = active ? cashSales(active) : 0;
  const inTotal = active ? cashIn(active) : 0;
  const outTotal = active ? cashOut(active) : 0;
  const exp = active ? expected(active) : 0;
  const movements = active ? db.movements.filter((m) => m.sessionId === active.id).sort((a, b) => new Date(b.at) - new Date(a.at)) : [];
  const recent = db.sessions.filter((s) => !active || s.id !== active.id).slice(0, 8);

  elRef.innerHTML = `
    <div class="view-enter cash-drawer-page">
      <div class="page-head">
        <div><h2>Cash Drawer</h2><p>Open, manage and close the counter cash drawer.</p></div>
        <div class="actions">
          ${active ? `<button class="btn btn-outline" id="cashMove">${icon("cash")} Cash in / out</button><button class="btn btn-primary" id="closeDrawer">${icon("check")} Close drawer</button>` : `<button class="btn btn-primary" id="openDrawer">${icon("cash")} Open drawer</button>`}
        </div>
      </div>

      <div class="cash-stat-grid">
        <div class="card stat"><div class="stat-top"><span class="stat-icon ${active ? "green" : "muted"}">${icon("cash", "lg")}</span>Drawer status</div><div class="stat-value cash-status ${active ? "open" : "closed"}">${statusLabel()}</div><div class="stat-foot">${active ? `${CASHIER} · ${COUNTER}` : "No active cash session"}</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon blue">${icon("layers", "lg")}</span>Opening float</div><div class="stat-value">${active ? money0(active.openingFloat) : "—"}</div><div class="stat-foot">${active ? `Opened ${fmtDate(active.openedAt)}` : "Start a drawer session to begin"}</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon green">${icon("dollar", "lg")}</span>Cash sales</div><div class="stat-value">${active ? money0(salesTotal) : "—"}</div><div class="stat-foot">${active ? `${sales.length} cash sale${sales.length === 1 ? "" : "s"}` : "No active session"}</div></div>
        <div class="card stat"><div class="stat-top"><span class="stat-icon violet">${icon("calculator", "lg")}</span>Expected cash</div><div class="stat-value">${active ? money0(exp) : "—"}</div><div class="stat-foot">${active ? `In ${money0(inTotal)} · Out ${money0(outTotal)}` : "Calculated when drawer is open"}</div></div>
      </div>

      ${active ? `
      <div class="cash-grid mt-16">
        <div class="card">
          <div class="card-head"><div><h3>Current drawer</h3><div class="sub">Expected cash position for ${COUNTER}</div></div><span class="badge badge-green">Open · ${sessionDuration(active)}</span></div>
          <div class="card-body">
            <div class="cash-breakdown">
              <div><span>Opening float</span><b>${money0(active.openingFloat)}</b></div>
              <div><span>Cash sales</span><b class="positive">+ ${money0(salesTotal)}</b></div>
              <div><span>Cash in</span><b class="positive">+ ${money0(inTotal)}</b></div>
              <div><span>Cash out</span><b class="negative">− ${money0(outTotal)}</b></div>
              <div class="total"><span>Expected in drawer</span><b>${money0(exp)}</b></div>
            </div>
            <div class="cash-note">Cash sales are taken from completed cash invoices during this drawer session. Card and UPI sales do not affect the expected drawer balance.</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Cash movements</h3><div class="sub">Manual additions and removals</div></div></div>
          <div class="card-body cash-movements">
            ${movements.length ? movements.map((m) => `<div class="list-row"><span class="movement-icon ${m.type}">${icon(m.type === "in" ? "plus" : "minus", "sm")}</span><div class="grow"><div class="t">${esc(m.reason || (m.type === "in" ? "Cash in" : "Cash out"))}</div><div class="s">${fmtDate(m.at)} · ${esc(m.by || CASHIER)}</div></div><b class="${m.type === "in" ? "positive" : "negative"}">${m.type === "in" ? "+" : "−"} ${money0(m.amount)}</b></div>`).join("") : `<div class="empty"><div class="big">${icon("cash", "lg")}</div><p>No manual cash movements</p><span>Use Cash in / out for petty cash, change float or other drawer adjustments.</span></div>`}
          </div>
        </div>
      </div>` : `
      <div class="card cash-closed mt-16"><div class="cash-closed-icon">${icon("cash", "lg")}</div><h3>Drawer is closed</h3><p>Open the drawer before the counter starts trading. Enter the physical opening cash so the end-of-shift variance can be calculated accurately.</p><button class="btn btn-primary" id="openDrawer2">${icon("plus")} Open drawer</button></div>`}

      <div class="card mt-16">
        <div class="card-head"><div><h3>Previous drawer sessions</h3><div class="sub">Recently closed sessions on this counter</div></div></div>
        <div class="table-wrap cash-history"><table><thead><tr><th>SESSION</th><th>OPENED</th><th>DURATION</th><th>EXPECTED</th><th>COUNTED</th><th>VARIANCE</th><th>STATUS</th></tr></thead><tbody>
          ${recent.length ? recent.map((s) => { const variance = s.countedCash == null ? null : round(s.countedCash - n(s.expectedCash)); return `<tr><td><b>${esc(s.id)}</b><div class="muted">${esc(s.by || CASHIER)} · ${esc(s.counter || COUNTER)}</div></td><td>${fmtDate(s.openedAt)}<div class="muted">Closed ${fmtDate(s.closedAt)}</div></td><td>${sessionDuration(s)}</td><td><b>${money0(s.expectedCash)}</b></td><td>${s.countedCash == null ? "—" : money0(s.countedCash)}</td><td>${variance == null ? "—" : `<span class="variance ${variance === 0 ? "zero" : variance > 0 ? "plus" : "minus"}">${variance > 0 ? "+" : ""}${money0(variance)}</span>`}</td><td><span class="badge badge-green">Closed</span></td></tr>`; }).join("") : `<tr><td colspan="7"><div class="empty"><p>No closed drawer sessions yet.</p></div></td></tr>`}
        </tbody></table></div>
      </div>
    </div>`;
  hydrateIcons(elRef);

  const open = () => openDrawerModal();
  $("#openDrawer", elRef)?.addEventListener("click", open);
  $("#openDrawer2", elRef)?.addEventListener("click", open);
  $("#cashMove", elRef)?.addEventListener("click", openMovementModal);
  $("#closeDrawer", elRef)?.addEventListener("click", openCloseModal);
}

function openDrawerModal() {
  const m = openModal({
    title: "Open cash drawer", sub: `${CASHIER} · ${COUNTER}`,
    body: `<div class="form-grid"><div class="field span-2"><label>Opening cash</label><div class="money-input"><span>${esc(state.settings.currency)}</span><input class="input" id="drawerOpening" inputmode="decimal" value="5000" autofocus /></div><span class="hint">Count the physical cash in the drawer before opening the shift.</span></div><div class="field span-2"><label>Note <span class="muted">(optional)</span></label><textarea class="textarea" id="drawerOpeningNote" rows="2" placeholder="e.g. Starting float received from manager"></textarea></div></div>`,
    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="drawerOpenSave">${icon("check")} Open drawer</button>`,
  });
  m.$("#drawerOpenSave").onclick = async () => {
    const opening = round(m.$("#drawerOpening").value);
    if (!Number.isFinite(opening) || opening < 0) return toast("Enter a valid opening cash amount", "error");
    if (db.active) return m.close();
    const at = now();
    const id = `DR-${at.slice(0,10).replaceAll("-", "")}-${String(db.sessions.length + 1).padStart(4, "0")}`;
    db.active = { id, openedAt: at, openedBy: CASHIER, by: CASHIER, counter: COUNTER, openingFloat: opening, openingNote: m.$("#drawerOpeningNote").value.trim() };
    await save(); m.close(); render(); toast("Cash drawer opened");
  };
}

function openMovementModal() {
  if (!db.active) return;
  const m = openModal({
    title: "Cash in / out", sub: "Record a manual drawer movement",
    body: `<div class="segmented full" id="movementType"><label class="seg"><input type="radio" name="mvType" value="in" checked />Cash in</label><label class="seg"><input type="radio" name="mvType" value="out" />Cash out</label></div><div class="form-grid" style="margin-top:16px"><div class="field span-2"><label>Amount</label><div class="money-input"><span>${esc(state.settings.currency)}</span><input class="input" id="movementAmount" inputmode="decimal" placeholder="0.00" autofocus /></div></div><div class="field span-2"><label>Reason</label><input class="input" id="movementReason" maxlength="120" placeholder="e.g. Petty cash / change float / supplier payment" /></div></div>`,
    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="movementSave">${icon("check")} Record movement</button>`,
  });
  m.$("#movementSave").onclick = async () => {
    const amount = round(m.$("#movementAmount").value);
    const reason = m.$("#movementReason").value.trim();
    if (!(amount > 0)) return toast("Enter an amount greater than zero", "error");
    if (!reason) return toast("Enter a reason for the cash movement", "error");
    const type = m.$('input[name="mvType"]:checked').value;
    db.movements.push({ id: `MV-${Date.now()}`, sessionId: db.active.id, type, amount, reason, at: now(), by: CASHIER });
    await save(); m.close(); render(); toast(type === "in" ? "Cash added to drawer" : "Cash removed from drawer");
  };
}

function openCloseModal() {
  const active = db.active;
  if (!active) return;
  const exp = expected(active);
  const m = openModal({
    title: "Close cash drawer", sub: `${CASHIER} · ${COUNTER}`,
    body: `<div class="close-summary"><div><span>Expected cash</span><b>${money0(exp)}</b></div><div><span>Cash sales</span><b>${money0(cashSales(active))}</b></div><div><span>Cash in / out</span><b>${money0(cashIn(active))} / ${money0(cashOut(active))}</b></div></div><div class="field" style="margin-top:18px"><label>Counted cash</label><div class="money-input"><span>${esc(state.settings.currency)}</span><input class="input" id="countedCash" inputmode="decimal" placeholder="0.00" autofocus /></div><span class="hint">Enter the actual physical cash counted in the drawer.</span></div><div class="field" style="margin-top:14px"><label>Closing note <span class="muted">(optional)</span></label><textarea class="textarea" id="closeNote" rows="2" placeholder="Anything to record about the closing count"></textarea></div>`,
    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="drawerCloseSave">${icon("check")} Close drawer</button>`,
  });
  const counted = m.$("#countedCash"), saveBtn = m.$("#drawerCloseSave");
  const update = () => {
    const v = round(counted.value);
    const d = Number.isFinite(v) ? round(v - exp) : 0;
    saveBtn.textContent = d === 0 ? "Close drawer" : `Close drawer · ${d > 0 ? "+" : "−"}${money0(Math.abs(d))}`;
  };
  counted.addEventListener("input", update);
  saveBtn.onclick = async () => {
    const countedCash = round(counted.value);
    if (!Number.isFinite(countedCash) || countedCash < 0) return toast("Enter the physical cash counted", "error");
    const closedAt = now();
    const closed = { ...active, closedAt, expectedCash: exp, countedCash, variance: round(countedCash - exp), closingNote: m.$("#closeNote").value.trim() };
    db.sessions.unshift(closed); db.sessions = db.sessions.slice(0, 50);
    db.active = null;
    await save(); m.close(); render(); toast(closed.variance === 0 ? "Drawer closed — count matches" : `Drawer closed — variance ${closed.variance > 0 ? "+" : "−"}${money0(Math.abs(closed.variance))}`, closed.variance === 0 ? "success" : "warn");
  };
}

export async function mount(el) { elRef = el; await load(); render(); clearInterval(timer); timer = setInterval(render, 15000); }
export function refresh() { render(); }
export function unmount() { clearInterval(timer); timer = null; elRef = null; }
