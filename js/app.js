// App bootstrap: hash router, shell, sync status, PWA, single-window guard, global scanner
import { backend, currentStatus, getConfig } from "./data/backend.js";
import { initFolderBackup } from "./data/folder-backup.js";
import * as dashboard from "./dashboard.js";
import * as inventory from "./inventory.js";
import * as labels from "./labels.js";
import * as pos from "./pos.js";
import { initPwa, promptInstall, pwa, renderInstallBar } from "./pwa.js";
import { applyTheme } from "./theme.js";
import { applyLanguage } from "./i18n.js";
import * as sales from "./sales.js";
import * as customers from "./customers.js";
import * as procurement from "./procurement.js";
import * as returns from "./returns-exchanges.js";
import * as cashDrawer from "./cash-drawer.js";
import * as eodClosing from "./eod-closing.js";
import * as auditLog from "./audit-log.js";
import * as lowStock from "./low-stock.js";
import * as reports from "./reports.js";
import * as loyalty from "./loyalty.js";
import * as staff from "./staff.js";
import { initStaff, currentStaff, loginStaff, switchOperator, openOperatorMenu, can, refreshStaffSession } from "./staff.js";
import { clearAuthToken } from "./auth.js";
import { openScanner } from "./scanner.js";
import * as settings from "./settings.js";
import { applySharedStoreConfigFromUrl, checkInstallation, showInstallationWizard } from "./installation.js";
import { findByCode, loadAll, refreshData, reloadLocal, state } from "./store.js";
import { $, $$, esc, hydrateIcons, icon, toast } from "./ui.js";

const routes = {
  dashboard: { title: "Dashboard", sub: () => state.settings.storeName, mod: dashboard },
  pos: { title: "POS / Billing", sub: () => "F2 search · F4 scan · F8 hold · F9 pay", mod: pos },
  inventory: { title: "Inventory", sub: () => "Products, stock levels & product codes", mod: inventory },
  labels: { title: "Product Labels", sub: () => "Print scannable product labels", mod: labels },
  sales: { title: "Invoices", sub: () => "Sales history & receipts", mod: sales },
  customers: { title: "Customers", sub: () => "Customer directory & purchase history", mod: customers },
  procurement: { title: "Suppliers & Purchases", sub: () => "Supplier directory & incoming stock", mod: procurement },
  returns: { title: "Returns & Exchanges", sub: () => "Returns, refunds & exchanges", mod: returns },
  cashDrawer: { title: "Cash Drawer", sub: () => "Open, manage & close the counter cash drawer", mod: cashDrawer },
  closing: { title: "End-of-Day Closing", sub: () => "Reconcile sales, payments & drawer", mod: eodClosing },
  audit: { title: "Audit Log", sub: () => "Operator activity & important POS actions", mod: auditLog },
  lowStock: { title: "Low Stock", sub: () => "Reorder alerts & stock exceptions", mod: lowStock },
  reports: { title: "Reports", sub: () => "Sales, payments & product performance", mod: reports },
  loyalty: { title: "Loyalty", sub: () => "Customer rewards & points", mod: loyalty },
  staff: { title: "Staff & Users", sub: () => "Operators, roles & secure PIN access", mod: staff },
  settings: { title: "Settings", sub: () => "Data, sync, offline & store profile", mod: settings },
};

const NAV_PERMISSION = {
  dashboard: "pos",
  pos: "pos",
  inventory: "inventory",
  labels: "labels",
  sales: "sales",
  customers: "customers",
  procurement: "procurement",
  returns: "returns",
  cashDrawer: "cashDrawer",
  closing: "closing",
  audit: "audit",
  lowStock: "lowStock",
  reports: "reports",
  loyalty: "loyalty",
  staff: "staff",
  settings: "settings",
};

let current = null;
let refreshPending = false;
let navigationSeq = 0;

async function navigate() {
  const seq = ++navigationSeq;
  const name = location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";
  const key = routes[name] ? name : "dashboard";
  const route = routes[key];
  if (current && current.mod.unmount) current.mod.unmount();
  const old = document.getElementById("view");
  const view = old.cloneNode(false);
  view.className = "view";
  old.replaceWith(view);

  $$("a[data-route]", document.getElementById("nav")).forEach((a) => {
    const routePermission = NAV_PERMISSION[a.dataset.route] || a.dataset.route;
    a.style.display = can(routePermission) ? "" : "none";
    a.classList.toggle("active", a.dataset.route === key);
  });

  $("#pageTitle").textContent = route.title;
  $("#pageSub").textContent = route.sub();
  document.title = `${route.title} · ${state.settings.storeName}`;
  current = { name: key, mod: route.mod, view, seq };
  try {
    await route.mod.mount(view);
    applyLanguage(view, state.settings.language);
    if (seq !== navigationSeq || current?.view !== view || location.hash.replace(/^#\/?/, "").split("?")[0] !== key) return;
    auditLog.recordAudit({ action: "Viewed page", module: route.title, detail: `Opened ${route.title}` });
  } catch (e) {
    if (seq !== navigationSeq || current?.view !== view) return;
    console.error(e);
    view.innerHTML = `<div class="empty"><div class="big">⚠️</div><h4>Something went wrong</h4><p>${esc(e.message || "Unable to load this page")}</p><button class="btn btn-primary" onclick="location.reload()" style="margin-top:12px">Reload</button></div>`;
  }
}

function renderOperator() {
  const u = currentStaff();
  const name = $("#cashierName");
  const role = $("#cashierRole");
  if (name) name.textContent = u?.name || "No operator";
  if (role) role.textContent = `${u?.role ? ({ admin: "Super Admin", manager: "Manager", cashier: "Cashier" }[u.role] || u.role) : "Not signed in"} · Counter 1`;
}
function applyFavicon() {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  link.href = state.settings.faviconUrl || "icons/favicon-32.png";
}
function renderBrandLogo() {
  const el = $("#brandLogo");
  const wrap = el?.closest(".brand");
  if (!el || !wrap) return;
  const custom = String(state.settings.brandLogoMode || "default") === "custom" && String(state.settings.logoUrl || "").trim();
  wrap.classList.toggle("custom-logo", !!custom);
  el.innerHTML = custom
    ? '<img class="brand-logo-img" src="' + esc(state.settings.logoUrl) + '" alt="' + esc(state.settings.storeName || "Store") + '" />'
    : icon("bag");
  $("#brandName").textContent = state.settings.storeName || "FreshMart";
  $("#brandSub").textContent = state.settings.brandTagline || "Grocery POS";
}
function applyBrand() {
  applyTheme(state.settings);
  renderBrandLogo();
  applyFavicon();
  $("#brandName").textContent = state.settings.storeName;
  renderOperator();
  if (current) {
    document.title = `${routes[current.name].title} · ${state.settings.storeName}`;
    $("#pageSub").textContent = routes[current.name].sub();
  }
  renderSync();
}
function tickClock() {
  const now = new Date();
  $("#clockTime").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  $("#clockDate").textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
const hhmm = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "…");
function renderSync() {
  const mode = getConfig().mode, m = state.meta, st = currentStatus() || {}, pill = $("#syncPill"), txt = $("#syncText"), banner = $("#banner");
  pill.className = "sync-pill";
  let bannerHtml = "", bannerKind = "";
  if (mode === "local") {
    pill.classList.add("demo"); txt.textContent = "This PC"; pill.title = "Data is stored on this PC only (works offline). Click to connect Google Sheets.";
  } else if (mode === "hybrid") {
    const pending = st.pending || 0;
    if (st.syncing || m.syncing) { pill.classList.add("busy"); txt.textContent = pending ? `Syncing ${pending}…` : "Syncing…"; }
    else if (!navigator.onLine) { pill.classList.add("offline"); txt.textContent = pending ? `Offline · ${pending} to sync` : "Offline"; bannerKind = "warn"; bannerHtml = `${icon("wifiOff")}<span><b>You’re offline.</b> Keep selling — everything is saved on this PC and will sync to Google Sheets automatically when the internet is back.</span>`; }
    else if (st.authRequired) {
      pill.classList.add("offline");
      txt.textContent = pending ? `${pending} waiting` : "Sign-in needed";
      bannerKind = "warn";
      bannerHtml = `${icon("alert")}<span><b>Google Sheets sign-in has expired.</b> Your data is safe on this PC. Sign in again to resume background sync.</span><button class="btn btn-sm btn-primary" id="bnSignIn">Sign in</button>`;
    }
    else if (st.lastError) {
      // Transient background sync failures are deliberately quiet. The queue remains durable
      // and hybrid-adapter retries automatically; only an expired authentication session needs
      // an operator-facing banner because it requires a sign-in action.
      pill.classList.add("offline");
      txt.textContent = pending ? `${pending} waiting` : "Sync paused";
      pill.title = "Google Sheets sync is retrying in the background. Your data is safe on this PC.";
    }
    else if (pending) { pill.classList.add("busy"); txt.textContent = `${pending} to sync`; }
    else { pill.classList.add("ok"); txt.textContent = `Synced ${hhmm(st.lastSyncAt)}`; }
    pill.title = `Offline-first: saved on this PC, synced with Google Sheets.${st.lastSyncAt ? " Last sync " + new Date(st.lastSyncAt).toLocaleString() : ""} Click to sync now.`;
  } else {
    if (m.syncing) { pill.classList.add("busy"); txt.textContent = "Syncing…"; }
    else if (m.error) { pill.classList.add("err"); txt.textContent = "Sync failed"; pill.title = m.error; bannerKind = "err"; bannerHtml = `${icon("alert")}<span><b>Can’t reach Google Sheets.</b> ${esc(m.error)}</span><button class="btn btn-sm btn-outline" id="bnRetry">Retry</button><a class="btn btn-sm btn-ghost" href="#/settings">Settings</a>`; }
    else { pill.classList.add("ok"); txt.textContent = `Live · ${hhmm(m.syncedAt)}`; pill.title = "Every action goes straight to Google Sheets. Click to sync now."; }
  }
  banner.className = `banner ${bannerKind ? "banner-" + bannerKind : "hidden"}`;
  banner.innerHTML = bannerHtml;
  const signIn = $("#bnSignIn");
  if (signIn) signIn.onclick = async () => {
    signIn.disabled = true;
    clearAuthToken();
    try {
      const { logoutStaff } = await import("./staff.js");
      await logoutStaff();
    } catch {}
    renderOperator();
    await loginStaff();
    renderOperator();
    await refreshData();
    renderSync();
  };
  const retry = $("#bnRetry");
  if (retry) retry.onclick = async () => { await refreshData(); renderSync(); if (getConfig().mode === "sheets" && !state.meta.error) navigate(); };
}
async function onPillClick() {
  const mode = getConfig().mode;
  if (mode === "local") { location.hash = "#/settings"; return; }
  if (mode === "hybrid" && !navigator.onLine) { toast(`Offline — ${(currentStatus() || {}).pending || 0} change(s) will sync when you're back online`, "warn"); return; }
  const changed = await refreshData();
  const st = currentStatus() || {};
  const err = mode === "hybrid" ? st.lastError : state.meta.error;
  if (err) toast(err, "error"); else toast(changed ? "Synced — new changes loaded" : "Everything is up to date");
}
function applyDataChange() {
  if (!current) return;
  if (document.querySelector(".modal-backdrop")) { refreshPending = true; return; }
  refreshPending = false;
  if (current.mod.refresh) current.mod.refresh(); else current.mod.mount(current.view);
}
function startPolling() {
  const tick = async () => {
    const mode = getConfig().mode;
    if (document.visibilityState !== "visible" || mode === "local" || !navigator.onLine) return;
    if (document.querySelector(".modal-backdrop")) return;
    await refreshData();
  };
  setInterval(() => { if (refreshPending && !document.querySelector(".modal-backdrop")) applyDataChange(); else tick(); }, 45000);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("online", () => { renderSync(); if (getConfig().mode === "sheets") refreshData(); });
  window.addEventListener("offline", renderSync);
}
function renderInstall() { $("#installBtn").classList.toggle("hidden", pwa.installed); renderInstallBar(); }
function renderDock() {
  const docked = document.documentElement.classList.contains("nav-collapsed"), btn = $("#dockBtn") || $("#dockTop");
  if (!btn) return;
  btn.title = docked ? "Show the full side menu" : "Dock the side menu";
}
function toggleDock() {
  const docked = document.documentElement.classList.toggle("nav-collapsed");
  localStorage.setItem("pos.navCollapsed", docked ? "1" : "0");
  renderDock();
}
function holdLock(onLost) {
  return new Promise((resolve) => {
    navigator.locks.request("freshmart-pos-window", { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      resolve(true);
      return new Promise((release) => onLost(release));
    });
  });
}
async function singleWindowGuard() {
  if (!navigator.locks || !window.BroadcastChannel) return;
  const channel = new BroadcastChannel("freshmart-pos-window");
  let releaseLock = null;
  const onLost = (release) => releaseLock = release;
  const showBlocked = (text) => {
    const o = document.createElement("div");
    o.className = "tab-lock";
    o.innerHTML = `<div class="tab-lock-card"><div class="big">🪟</div><h3>FreshMart POS is open in another window</h3><p>${text}</p><button class="btn btn-primary" id="useHere">Use it in this window</button></div>`;
    document.body.appendChild(o);
    return o;
  };
  channel.onmessage = (e) => {
    if (e.data === "takeover" && releaseLock) {
      releaseLock(); releaseLock = null; document.body.innerHTML = "";
      const o = showBlocked("You switched to another window. Only one window can be used at a time so offline data stays consistent.");
      o.querySelector("#useHere").onclick = () => location.reload();
    }
  };
  if (await holdLock(onLost)) return;
  await new Promise((resolve) => {
    const o = showBlocked("To keep the offline data consistent, the POS runs in one window at a time.");
    o.querySelector("#useHere").onclick = async () => {
      o.querySelector("#useHere").disabled = true;
      channel.postMessage("takeover");
      navigator.locks.request("freshmart-pos-window", () => {
        o.remove(); resolve();
        return new Promise((release) => onLost(release));
      });
    };
  });
}
async function handleGlobalCode(code) {
  if (/^INV-/i.test(code)) { const ok = await sales.openInvoiceByNo(code); return ok ? { ok: true, message: "Invoice found" } : { ok: false, message: `Invoice ${code} not found` }; }
  const p = findByCode(code);
  if (!p) return { ok: false, message: `No product for "${code}"` };
  inventory.showProductCard(p, { onSaved: () => navigate() });
  return { ok: true, message: `${p.emoji} ${p.name}` };
}
async function init() {
  hydrateIcons(document);
  const bootView = $("#view");
  if (bootView) {
    bootView.innerHTML = `<div class="boot-state"><div class="boot-card"><div class="boot-icon">${icon("sync")}</div><b>Preparing your counter</b><span>Loading products, stock and invoices. Please wait…</span></div></div>`;
    hydrateIcons(bootView);
  }
  applySharedStoreConfigFromUrl();
  await initStaff();
  renderOperator();
  const installation = await checkInstallation();
  if (!installation.installed) {
    await showInstallationWizard(bootView);
    await new Promise((resolve) => {
      window.addEventListener("installation:complete", () => { navigate(); resolve(); }, { once: true });
    });
    renderOperator();
  }
  const dataReady = (async () => {
    try {
      await loadAll();
    } catch (e) {
      console.error(e);
      // Hybrid mode is offline-first: represent sync failures in the single status/banner state.
    }
  })();
  if (!currentStaff()) { await loginStaff(); renderOperator(); }
  await dataReady;
  navigate();
  renderBrandLogo();
  initPwa();
  await singleWindowGuard();
  tickClock();
  setInterval(tickClock, 20000);
  setInterval(async () => { const u = await refreshStaffSession(); if (!u) { renderOperator(); location.hash = "#/dashboard"; await loginStaff(); renderOperator(); } }, 60000);
  window.addEventListener("sync:status", renderSync);
  window.addEventListener("data:changed", applyDataChange);
  window.addEventListener("settings:changed", () => { applyBrand(); applyLanguage(document, state.settings.language); });
  window.addEventListener("language:preview", (e) => applyLanguage(document, e.detail?.language || "en"));
  window.addEventListener("staff:changed", renderOperator);
  window.addEventListener("pos:synced", () => reloadLocal());
  window.addEventListener("pwa:status", renderInstall);
  $("#syncPill").addEventListener("click", onPillClick);
  $("#cashierName")?.closest(".cashier-card")?.addEventListener("click", () => openOperatorMenu());
  $("#installBtn").addEventListener("click", promptInstall);
  const dockButton = $("#dockTop");
  if (dockButton) dockButton.id = "dockBtn";
  $("#dockBtn")?.addEventListener("click", toggleDock);
  window.addEventListener("data:changed", () => applyTheme(state.settings));
  renderDock();
  $("#globalScan").addEventListener("click", () => {
    if (current && current.name === "pos") return pos.startScan();
    openScanner({ title: "Scan code", onCode: handleGlobalCode });
  });
  initFolderBackup(() => backend.exportData()).catch(() => {});
  applyTheme(state.settings);
  applyLanguage(document, state.settings.language);
  $("#brandName").textContent = state.settings.storeName;
  renderBrandLogo();
  applyFavicon();
  renderSync();
  renderInstall();
  window.addEventListener("hashchange", navigate);
  startPolling();
  if (getConfig().mode === "hybrid") refreshData();
}
init();
