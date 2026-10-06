// Staff / User Management — local-first operator directory and session identity.
// Staff records are kept in IndexedDB so the POS can identify the operator offline.
// PINs are stored only as PBKDF2 hashes; plaintext PINs are never persisted.
import { idb } from "./data/idb.js";
import { uid } from "./data/logic.js";
import { $, esc, hydrateIcons, icon, openModal, toast, confirmDialog } from "./ui.js";

const KEY = "staff.users.v1";
const SESSION_KEY = "staff.session.v1";
const ITERATIONS = 120000;

export const ROLES = {
  admin: {
    label: "Admin",
    description: "Full access including staff, settings and all operational controls.",
    permissions: ["pos","inventory","sales","customers","labels","procurement","returns","cashDrawer","closing","audit","lowStock","reports","loyalty","settings","staff"],
  },
  manager: {
    label: "Manager",
    description: "Operational management access; staff and system settings remain restricted.",
    permissions: ["pos","inventory","sales","customers","labels","procurement","returns","cashDrawer","closing","audit","lowStock","reports","loyalty"],
  },
  cashier: {
    label: "Cashier",
    description: "Sales-counter access with customer, invoice and loyalty functions.",
    permissions: ["pos","sales","customers","labels","loyalty"],
  },
};

let users = [];
let currentId = "";
let root = null;
let filter = "";
let statusFilter = "active";
let ready = null;

const now = () => new Date().toISOString();
const clean = (v, max = 120) => String(v ?? "").trim().slice(0, max);
const initials = name => clean(name, 60).split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join("").toUpperCase() || "?";
const normalizeRole = role => ROLES[role] ? role : "cashier";
const safeUser = u => ({ id: clean(u.id,80), name: clean(u.name,80), username: clean(u.username,60).toLowerCase(), phone: clean(u.phone,30), role: normalizeRole(u.role), active: u.active !== false, createdAt: u.createdAt || now(), updatedAt: u.updatedAt || now(), lastLoginAt: u.lastLoginAt || null, pinSalt: u.pinSalt || "", pinHash: u.pinHash || "", mustChangePin: !!u.mustChangePin });

function bytesToB64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function b64ToBytes(s) { const bin = atob(s); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
function randomBytes(n=16) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
async function hashPin(pin, saltBytes) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure PIN hashing is not available in this browser.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt:saltBytes, iterations:ITERATIONS, hash:"SHA-256" }, key, 256);
  return bytesToB64(bits);
}
async function makePin(pin) {
  const salt = randomBytes();
  return { pinSalt: bytesToB64(salt), pinHash: await hashPin(pin, salt) };
}
async function verifyPin(user, pin) {
  if (!user?.pinHash || !user.pinSalt) return false;
  const hash = await hashPin(pin, b64ToBytes(user.pinSalt));
  return hash === user.pinHash;
}

function activeUsers() { return users.filter(u => u.active); }
function getUser(id) { return users.find(u => u.id === id) || null; }
export function currentStaff() { return getUser(currentId) || activeUsers()[0] || null; }
export function can(permission, user = currentStaff()) { return !!user && (ROLES[normalizeRole(user.role)]?.permissions || []).includes(permission); }
export function permissionLabel(role) { return ROLES[normalizeRole(role)]?.label || "Cashier"; }

async function persist() {
  users = users.map(safeUser);
  await idb.set(KEY, { users });
  window.dispatchEvent(new CustomEvent("staff:changed"));
}
async function persistSession() {
  await idb.set(SESSION_KEY, { userId: currentId, at: now() });
}

async function load() {
  const saved = await idb.get(KEY).catch(() => null);
  users = Array.isArray(saved?.users) ? saved.users.map(safeUser).filter(u => u.id && u.name && u.username) : [];
  const session = await idb.get(SESSION_KEY).catch(() => null);
  currentId = session?.userId && getUser(session.userId)?.active ? session.userId : "";
  if (!users.length) {
    const pin = await makePin("1234");
    users = [{
      id: uid(),
      name: "Anand Ibrahim",
      username: "admin",
      phone: "",
      role: "admin",
      active: true,
      createdAt: now(),
      updatedAt: now(),
      lastLoginAt: null,
      ...pin,
      mustChangePin: true,
    }];
    currentId = users[0].id;
    await idb.set(KEY, { users });
    await persistSession();
  } else if (!currentStaff()) {
    currentId = activeUsers()[0]?.id || "";
    await persistSession();
  }
}

export async function initStaff() {
  if (!ready) ready = load();
  await ready;
  return currentStaff();
}

async function signIn(user, pin) {
  if (!user?.active) throw new Error("This staff account is inactive.");
  if (!(await verifyPin(user, pin))) throw new Error("Incorrect PIN.");
  currentId = user.id;
  user.lastLoginAt = now();
  user.updatedAt = now();
  await persist();
  await persistSession();
  toast(`Signed in as ${user.name}`);
  return user;
}

async function askPin(user, title = "Switch operator") {
  return new Promise(resolve => {
    const m = openModal({
      title, sub: `${user.name} · ${permissionLabel(user.role)}`,
      size: "sm",
      body: `<div class="field"><label for="staffPin">PIN</label><input class="input" id="staffPin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Enter PIN" /></div><div class="staff-pin-error" id="staffPinError"></div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="staffPinGo">${icon("check")} Continue</button>`,
      onClose: () => resolve(false),
    });
    const input = m.$("#staffPin"), err = m.$("#staffPinError"), go = m.$("#staffPinGo");
    const submit = async () => {
      const pin = input.value.trim();
      if (!pin) { err.textContent = "Enter the staff PIN."; return; }
      go.disabled = true; err.textContent = "";
      try { await signIn(user, pin); m.close(); resolve(true); }
      catch (e) { err.textContent = e.message; go.disabled = false; input.select(); }
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    go.onclick = submit;
    setTimeout(() => input.focus(), 40);
  });
}

export async function switchOperator() {
  await initStaff();
  const list = activeUsers();
  if (list.length <= 1) return toast("No other active staff accounts are available.", "warn");
  const m = openModal({
    title: "Switch operator",
    sub: "Select the staff member who is operating this counter.",
    size: "sm",
    body: `<div class="staff-switch-list">${list.map(u => `<button class="staff-switch-row ${u.id===currentId?"active":""}" data-id="${esc(u.id)}"><span class="staff-avatar">${esc(initials(u.name))}</span><span class="grow"><b>${esc(u.name)}</b><small>${esc(permissionLabel(u.role))} · @${esc(u.username)}</small></span>${u.id===currentId?'<span class="badge badge-green">Current</span>':""}</button>`).join("")}</div>`,
    footer: `<button class="btn btn-outline" data-close>Cancel</button>`,
  });
  m.body.addEventListener("click", async e => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    const user = getUser(row.dataset.id); if (!user) return;
    m.close();
    if (user.id !== currentId) await askPin(user);
  });
}

function filtered() {
  const q = filter.toLowerCase();
  return users.filter(u => {
    if (statusFilter === "active" && !u.active) return false;
    if (statusFilter === "inactive" && u.active) return false;
    return !q || [u.name,u.username,u.phone,permissionLabel(u.role)].join(" ").toLowerCase().includes(q);
  });
}

function render() {
  if (!root?.isConnected) return;
  const me = currentStaff();
  const rows = filtered();
  const active = activeUsers();
  root.innerHTML = `
    <div class="view-enter staff-page">
      <div class="staff-toolbar">
        <div><h2>Staff & User Management</h2><p>Manage POS operators, roles and secure PIN access on this counter.</p></div>
        <div class="actions"><button class="btn btn-outline" id="staffSwitch">${icon("user")} Switch operator</button>${can("staff") ? `<button class="btn btn-primary" id="staffAdd">${icon("plus")} Add staff</button>` : ""}</div>
      </div>
      <div class="staff-stats">
        <div class="card stat"><div class="stat-top">Active staff</div><div class="stat-value">${active.length}</div><div class="stat-foot">Accounts allowed to sign in</div></div>
        <div class="card stat"><div class="stat-top">Administrators</div><div class="stat-value">${users.filter(u=>u.active&&u.role==="admin").length}</div><div class="stat-foot">Full system access</div></div>
        <div class="card stat"><div class="stat-top">Managers</div><div class="stat-value">${users.filter(u=>u.active&&u.role==="manager").length}</div><div class="stat-foot">Operational management</div></div>
        <div class="card stat"><div class="stat-top">Current operator</div><div class="stat-value staff-current">${esc(me?.name || "—")}</div><div class="stat-foot">${esc(me ? permissionLabel(me.role) : "No active operator")}</div></div>
      </div>
      <section class="card mt-16 staff-card">
        <div class="card-head"><div><h3>Staff accounts</h3><div class="sub">PINs are stored as salted PBKDF2 hashes and never shown in the UI.</div></div></div>
        <div class="staff-filters"><div class="staff-search"><span class="staff-search-icon">${icon("search","sm")}</span><input class="input" id="staffSearch" placeholder="Search name, username or role..." value="${esc(filter)}"></div><select class="input staff-status" id="staffStatus"><option value="active" ${statusFilter==="active"?"selected":""}>Active staff</option><option value="inactive" ${statusFilter==="inactive"?"selected":""}>Inactive staff</option><option value="all" ${statusFilter==="all"?"selected":""}>All staff</option></select></div>
        <div class="table-wrap staff-table"><table class="table"><thead><tr><th>STAFF</th><th>USERNAME</th><th>ROLE</th><th>STATUS</th><th>LAST LOGIN</th><th></th></tr></thead><tbody>${rows.length ? rows.map(u => `<tr><td><div class="staff-person"><span class="staff-avatar">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b>${u.id===me?.id?'<span class="staff-you">Current operator</span>':""}</div></div></td><td><b>@${esc(u.username)}</b>${u.phone?`<div class="muted">${esc(u.phone)}</div>`:""}</td><td><span class="badge ${u.role==="admin"?"badge-violet":u.role==="manager"?"badge-blue":"badge-green"}">${esc(permissionLabel(u.role))}</span></td><td><span class="badge ${u.active?"badge-green":"badge-gray"}">${u.active?"Active":"Inactive"}</span></td><td>${u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Never"}</td><td class="staff-actions">${can("staff")?`<button class="icon-btn" data-edit="${esc(u.id)}" title="Edit">${icon("edit")}</button><button class="icon-btn" data-pin="${esc(u.id)}" title="Reset PIN">${icon("key")}</button>${u.id!==me?.id?`<button class="icon-btn ${u.active?"danger":""}" data-toggle="${esc(u.id)}" title="${u.active?"Deactivate":"Activate"}">${icon(u.active?"x":"check")}</button>`:""}`:"—"}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty"><div class="big">${icon("user")}</div><h4>No staff accounts found</h4><p>Adjust the filter or add a staff member.</p></div></td></tr>`}</tbody></table></div>
      </section>
      <div class="staff-security-note"><b>Security boundary:</b> this phase provides local operator identity and PIN protection. Server-side authorization and Google Sheets staff synchronization should be added before using this as a multi-counter production authentication system.</div>
    </div>`;
  hydrateIcons(root);
  $("#staffSearch",root).oninput = e => { filter=e.target.value; render(); const i=$("#staffSearch",root); i?.focus(); i?.setSelectionRange(filter.length,filter.length); };
  $("#staffStatus",root).onchange = e => { statusFilter=e.target.value; render(); };
  $("#staffAdd",root)?.addEventListener("click",()=>openEditor());
  $("#staffSwitch",root)?.addEventListener("click",switchOperator);
  root.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEditor(getUser(b.dataset.edit)));
  root.querySelectorAll("[data-pin]").forEach(b=>b.onclick=()=>resetPin(getUser(b.dataset.pin)));
  root.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>toggleUser(getUser(b.dataset.toggle)));
}

async function openEditor(existing=null) {
  if (!can("staff")) return toast("Only Admin users can manage staff accounts.", "error");
  const editing = !!existing;
  const m = openModal({
    title: editing ? "Edit staff member" : "Add staff member",
    sub: editing ? `Update ${existing.name}'s role and account details.` : "Create an operator account for this POS.",
    size: "md",
    body: `<div class="form-grid"><div class="field"><label>Full name</label><input class="input" id="sfName" maxlength="80" value="${esc(existing?.name||"")}"></div><div class="field"><label>Username</label><input class="input" id="sfUser" maxlength="60" value="${esc(existing?.username||"")}" ${editing?"readonly":""}></div><div class="field"><label>Role</label><select class="input" id="sfRole">${Object.entries(ROLES).map(([k,r])=>`<option value="${k}" ${(existing?.role||"cashier")===k?"selected":""}>${r.label}</option>`).join("")}</select><span class="hint" id="sfRoleHint"></span></div><div class="field"><label>Phone <span class="muted">(optional)</span></label><input class="input" id="sfPhone" maxlength="30" value="${esc(existing?.phone||"")}"></div>${editing?"":`<div class="field span-2"><label>Initial PIN</label><input class="input" id="sfPin" type="password" inputmode="numeric" maxlength="12" placeholder="4–12 digits"><span class="hint">The PIN is immediately converted to a salted PBKDF2 hash.</span></div>`}</div>`,
    footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="sfSave">${icon("check")} ${editing?"Save changes":"Create staff"}</button>`,
  });
  const roleHint=()=>{m.$("#sfRoleHint").textContent=ROLES[m.$("#sfRole").value].description;}; roleHint(); m.$("#sfRole").onchange=roleHint;
  m.$("#sfSave").onclick=async()=>{
    const name=clean(m.$("#sfName").value,80), username=clean(m.$("#sfUser").value,60).toLowerCase().replace(/[^a-z0-9._-]/g,""), role=normalizeRole(m.$("#sfRole").value), phone=clean(m.$("#sfPhone").value,30);
    if(name.length<2)return toast("Enter the staff member's name.","error");
    if(username.length<2)return toast("Enter a valid username.","error");
    if(!editing && users.some(u=>u.username===username))return toast("That username is already in use.","error");
    const btn=m.$("#sfSave");btn.disabled=true;
    try{
      if(editing){Object.assign(existing,{name,role,phone,updatedAt:now()});await persist();toast("Staff account updated");}
      else{const pin=m.$("#sfPin").value.trim();if(!/^\d{4,12}$/.test(pin)){btn.disabled=false;return toast("Use a numeric PIN with 4–12 digits.","error");}const hashes=await makePin(pin);users.push({id:uid(),name,username,role,phone,active:true,createdAt:now(),updatedAt:now(),lastLoginAt:null,...hashes,mustChangePin:true});await persist();toast("Staff account created");}
      m.close();render();
    }catch(e){btn.disabled=false;toast(e.message||"Could not save staff account.","error");}
  };
}

async function resetPin(user) {
  if(!can("staff") || !user) return toast("Only Admin users can reset staff PINs.","error");
  const m=openModal({title:"Reset staff PIN",sub:user.name, size:"sm",body:`<div class="field"><label>New PIN</label><input class="input" id="newStaffPin" type="password" inputmode="numeric" maxlength="12" placeholder="4–12 digits"></div>`,footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="pinSave">${icon("check")} Reset PIN</button>`});
  m.$("#pinSave").onclick=async()=>{const pin=m.$("#newStaffPin").value.trim();if(!/^\d{4,12}$/.test(pin))return toast("Use a numeric PIN with 4–12 digits.","error");const hashes=await makePin(pin);Object.assign(user,hashes,{mustChangePin:true,updatedAt:now()});await persist();m.close();toast(`PIN reset for ${user.name}`);render();};
}

async function toggleUser(user) {
  if(!can("staff") || !user || user.id===currentId) return;
  const action=user.active?"Deactivate":"Activate";
  if(!(await confirmDialog({title:`${action} staff account?`,message:`${action} ${user.name}'s POS sign-in account?`,confirmText:action,danger:user.active})))return;
  user.active=!user.active;user.updatedAt=now();await persist();render();toast(`${user.name} is now ${user.active?"active":"inactive"}`);
}

export async function mount(el) { root=el; await initStaff(); render(); }
export function refresh(){render();}
export function unmount(){root=null;}
window.addEventListener("staff:changed",()=>{if(root?.isConnected)render();});
