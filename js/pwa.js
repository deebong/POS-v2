// PWA: service worker + updates, "Install app" (desktop shortcut) prompt, install help & diagnostics.
import { esc, icon, openModal, toast, toastAction, downloadFile } from "./ui.js";

export const pwa = {
  swSupported: "serviceWorker" in navigator,
  swReady: false,
  installable: false, // the browser handed us an install prompt
  installed: false,
};

let deferredPrompt = null;
let updateRequested = false;
const BAR_KEY = "pos.installBarHiddenUntil";
const emit = () => window.dispatchEvent(new CustomEvent("pwa:status"));

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  navigator.standalone === true;

export function browserInfo() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Edg\//.test(ua)) return "edge";
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Firefox\//.test(ua)) return /Android/.test(ua) ? "firefox-android" : "firefox";
  if (/OPR\//.test(ua)) return "opera";
  if (/Chrome\//.test(ua)) return /Android/.test(ua) ? "chrome-android" : "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

/**
 * FreshMart uses an automatic PWA update strategy. Once a new service worker
 * has finished installing, activate it immediately and reload the page once.
 * This prevents users from being stuck on an old cached app shell and means
 * they do not have to press Ctrl+F5 or manually accept an update prompt.
 */
function activateUpdate(reg) {
  if (!reg || !reg.waiting) return;
  updateRequested = true;
  reg.waiting.postMessage({ type: "SKIP_WAITING" });
}

function promptUpdate(reg) {
  // Kept as a small compatibility wrapper for callers that may still use the
  // old function name. Updates are now applied automatically.
  activateUpdate(reg);
}

export function initPwa() {
  pwa.installed = isStandalone();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own "Install" bar/button instead of the mini-infobar
    deferredPrompt = e;
    pwa.installable = true;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    pwa.installable = false;
    pwa.installed = true;
    emit();
    toast("Installed! FreshMart POS now has a desktop shortcut and opens in its own window.");
  });
  const mq = window.matchMedia("(display-mode: standalone)");
  if (mq.addEventListener) {
    mq.addEventListener("change", () => {
      pwa.installed = isStandalone();
      emit();
    });
  }

  if (!pwa.swSupported || !window.isSecureContext) return;
  // Offline start is a bonus: if the service worker is blocked (policies, extensions, test tools),
  // the POS must still work normally, so nothing here is allowed to throw.
  try {
    Promise.resolve(navigator.serviceWorker.register("sw.js", { scope: "./" }))
      .then((reg) => {
        if (!reg) return;
        if (reg.waiting && navigator.serviceWorker.controller) activateUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) {
              activateUpdate(reg);
            }
          });
        });

        // Check when the app comes back to the foreground as well as hourly.
        // This is especially useful for an installed POS that stays open all day.
        const checkForUpdate = () => reg.update().catch(() => {});
        setInterval(checkForUpdate, 60 * 60 * 1000);
        window.addEventListener("focus", checkForUpdate);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
      })
      .catch((e) => console.warn("Service worker registration failed", e));
    Promise.resolve(navigator.serviceWorker.ready)
      .then((r) => {
        if (!r) return;
        pwa.swReady = true;
        emit();
      })
      .catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!updateRequested || reloading) return; // first install also fires this — don't reload then
      reloading = true;
      toast("FreshMart POS updated. Reloading…");
      // Give the toast a moment to render, then reload onto the newly activated shell.
      setTimeout(() => location.reload(), 250);
    });
  } catch (e) {
    console.warn("Offline support unavailable", e);
  }
}

/** Shows the browser's install dialog when possible, otherwise step-by-step instructions. */
export async function promptInstall() {
  if (deferredPrompt) {
    const e = deferredPrompt;
    deferredPrompt = null;
    pwa.installable = false;
    emit();
    try {
      await e.prompt();
      const choice = await e.userChoice;
      return choice && choice.outcome;
    } catch {
      /* fall through to the help dialog */
    }
  }
  openInstallHelp();
  return "help";
}

/* ---------------- install bar ("ask to install") ---------------- */
export function renderInstallBar() {
  const bar = document.getElementById("installBar");
  if (!bar) return;
  const b = browserInfo();
  const hiddenUntil = Number(localStorage.getItem(BAR_KEY) || 0);
  const canAsk = pwa.installable || b === "ios" || b === "safari";
  if (pwa.installed || Date.now() < hiddenUntil || !canAsk) {
    bar.className = "install-bar hidden";
    bar.innerHTML = "";
    return;
  }
  bar.className = "install-bar";
  bar.innerHTML = `
    <img src="icons/icon-192.png" alt="" width="36" height="36" />
    <div><b>Install FreshMart POS on this device</b>
      <span>Adds a desktop shortcut and Start-menu entry, opens in its own window and works without internet.</span></div>
    <button class="btn btn-primary btn-sm" data-install>${icon("install", "sm")} Install</button>
    <button class="btn btn-ghost btn-sm" data-later>Not now</button>`;
  bar.querySelector("[data-install]").onclick = () => promptInstall();
  bar.querySelector("[data-later]").onclick = () => {
    localStorage.setItem(BAR_KEY, String(Date.now() + 7 * 86400000));
    renderInstallBar();
  };
}

/* ---------------- help dialog + diagnostics ---------------- */
export async function installDiagnostics() {
  const checks = [];
  checks.push({ ok: window.isSecureContext, label: "Secure connection (https://)", hint: "Open the POS with an https:// address (GitHub Pages does this) or http://localhost." });
  const link = document.querySelector('link[rel="manifest"]');
  let manifest = null;
  try {
    const r = await fetch(link.href, { cache: "no-store" });
    manifest = r.ok ? await r.json() : null;
  } catch {
    manifest = null;
  }
  checks.push({ ok: Boolean(manifest && manifest.name && manifest.start_url && manifest.display), label: "App manifest (manifest.webmanifest)", hint: "Upload manifest.webmanifest to the same folder as index.html." });
  let iconsOk = false;
  if (manifest && Array.isArray(manifest.icons)) {
    const wanted = manifest.icons.filter((i) => /(^|\s)(192x192|512x512)(\s|$)/.test(i.sizes || ""));
    const found = await Promise.all(wanted.map((i) => fetch(new URL(i.src, link.href), { cache: "no-store" }).then((r) => r.ok, () => false)));
    iconsOk = wanted.length >= 2 && found.every(Boolean);
  }
  checks.push({ ok: iconsOk, label: "App icons (192 px and 512 px)", hint: "Upload the whole icons folder." });
  let reg = null;
  try {
    reg = pwa.swSupported ? await navigator.serviceWorker.getRegistration() : null;
  } catch {
    reg = null;
  }
  checks.push({ ok: Boolean(reg && reg.active), label: "Offline service worker (sw.js)", hint: "sw.js must be next to index.html. Reload the page once after uploading." });
  return checks;
}

const STEPS = {
  chrome: [
    "Click the <b>Install</b> icon (a small monitor with an arrow) at the right end of the address bar,",
    "or open the <b>⋮</b> menu ▸ <b>Cast, save and share</b> ▸ <b>Install page as app…</b> (older Chrome: <b>⋮ ▸ Install FreshMart POS…</b> or <b>More tools ▸ Create shortcut… ▸ tick “Open as window”</b>).",
    "Click <b>Install</b>. Chrome adds a <b>desktop shortcut</b> and a Start-menu entry.",
  ],
  edge: [
    "Click the <b>App available</b> icon in the address bar, or open <b>⋯</b> ▸ <b>Apps</b> ▸ <b>Install this site as an app</b>.",
    "Click <b>Install</b>, then tick <b>Create Desktop shortcut</b> (and Pin to taskbar if you like).",
  ],
  firefox: [
    "Firefox on computers can't install web apps. Open this page in <b>Chrome</b> or <b>Edge</b> to install it,",
    "or use <b>Download desktop shortcut</b> below — it opens the POS in your browser with one double-click.",
  ],
  safari: ["In Safari choose <b>File ▸ Add to Dock…</b> (macOS Sonoma or newer), then click <b>Add</b>."],
  ios: ["Tap the <b>Share</b> button, then <b>Add to Home Screen</b>, then <b>Add</b>."],
  "chrome-android": ["Tap <b>⋮</b> ▸ <b>Install app</b> (or <b>Add to Home screen</b>) ▸ <b>Install</b>."],
  samsung: ["Tap the <b>≡</b> menu ▸ <b>Add page to</b> ▸ <b>Home screen</b>."],
  "firefox-android": ["Tap <b>⋮</b> ▸ <b>Install</b> (or <b>Add to Home screen</b>)."],
  opera: ["Open the <b>O</b> menu ▸ <b>Install FreshMart POS…</b>, or use Chrome / Edge."],
  other: ["Use Google Chrome or Microsoft Edge and choose <b>Install app</b> from the browser menu."],
};

function shortcutFile() {
  const url = location.href.split("#")[0];
  return `[InternetShortcut]\r\nURL=${url}\r\n`;
}

export async function openInstallHelp() {
  const b = browserInfo();
  const modal = openModal({
    title: "Install FreshMart POS",
    sub: "Get a desktop shortcut and use it like a normal program — even offline",
    size: "md",
    body: `<div class="install-help">
      <ol class="steps">${(STEPS[b] || STEPS.other).map((s) => `<li>${s}</li>`).join("")}</ol>
      ${b === "chrome" || b === "edge" ? `<p class="muted" style="font-size:12.5px">Don't see the install option? Browsers offer it once the checks below are green — and Chrome sometimes waits until you've used the page for about 30 seconds. If you installed and removed it before, use the menu option above.</p>` : ""}
      <h4 style="margin:16px 0 8px">Checks</h4>
      <div class="diag" id="diag"><div class="muted">Checking…</div></div>
      <div class="btn-row"><button class="btn btn-outline btn-sm" data-shortcut>${icon("download", "sm")} Download desktop shortcut (.url)</button>
      <span class="muted" style="font-size:12.5px">Windows: save it to your Desktop. Works in any browser.</span></div>
    </div>`,
    footer: `<button class="btn btn-outline" data-close2>Close</button>${pwa.installable ? `<button class="btn btn-primary" data-now>${icon("install")} Install now</button>` : ""}`,
  });
  modal.$("[data-close2]").onclick = () => modal.close();
  const now = modal.$("[data-now]");
  if (now) {
    now.onclick = () => {
      modal.close();
      promptInstall();
    };
  }
  modal.$("[data-shortcut]").onclick = () => downloadFile("FreshMart POS.url", shortcutFile(), "application/octet-stream");
  const checks = await installDiagnostics();
  const box = modal.$("#diag");
  if (box) {
    box.innerHTML = checks
      .map((c) => `<div class="diag-row ${c.ok ? "ok" : "bad"}">${icon(c.ok ? "check" : "x", "sm")}<div><b>${esc(c.label)}</b>${c.ok ? "" : `<span>${esc(c.hint)}</span>`}</div></div>`)
      .join("");
  }
}

export async function storageInfo() {
  const s = navigator.storage;
  const est = s && s.estimate ? await s.estimate().catch(() => null) : null;
  const persisted = s && s.persisted ? await s.persisted().catch(() => false) : false;
  return { usage: est ? est.usage || 0 : 0, quota: est ? est.quota || 0 : 0, persisted, supported: Boolean(s && s.persist) };
}

/** Asks the browser never to evict this app's data (IndexedDB) under storage pressure. */
export async function requestPersist() {
  const s = navigator.storage;
  return s && s.persist ? s.persist().catch(() => false) : false;
}
