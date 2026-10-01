// Settings: data storage & sync mode, offline/PWA, backups, store profile, receipt preview
import { backend, currentStatus, getConfig, getDevice, saveConfig, setDeviceCode } from "./data/backend.js";
import {
  chooseFolder, folderState, folderSupported, forgetFolder, reconnectFolder, writeNow,
} from "./data/folder-backup.js";
import { peekLocalDb } from "./data/local-adapter.js";
import { sampleProducts } from "./data/sample.js";
import { createSheetsAdapter } from "./data/sheets-adapter.js";
import { promptInstall, pwa, requestPersist, storageInfo } from "./pwa.js";
import { receiptHtml } from "./receipt.js";
import { importBulk, importProducts, loadAll, reloadLocal, saveSettings, scriptUpToDate, state } from "./store.js";
import { THEME_PRESETS, applyTheme, normalizeColor } from "./theme.js";
import { buildExport, demoPayload, invoiceLinesCsv, invoicesCsv, productsCsv, toPortable } from "./transfer.js";
import {
  $, choiceDialog, confirmDialog, downloadFile, esc, fmtBytes, hydrateIcons, icon, timeAgo, toast,
} from "./ui.js";

const SAMPLE_SALE = {
  invoiceNo: "INV-20250101-C1-0042",
  createdAt: new Date().toISOString(),
  customerName: "Priya Sharma",
  customerPhone: "",
  subtotal: 262,
  discount: 0,
  tax: 11.2,
  total: 273.2,
  paymentMethod: "cash",
  amountPaid: 300,
  changeDue: 26.8,
  status: "completed",
};
const SAMPLE_ITEMS = [
  { name: "Bananas (Robusta)", qty: 1.25, unit: "kg", price: 48, lineSubtotal: 60 },
  { name: "Toned Milk 1L", qty: 2, unit: "pc", price: 56, lineSubtotal: 112 },
  { name: "Brown Bread", qty: 1, unit: "pc", price: 50, lineSubtotal: 50 },
  { name: "Cold Drink 750ml", qty: 1, unit: "pc", price: 40, lineSubtotal: 40 },
];

const MODES = {
  local: { icon: "monitor", title: "This PC only", sub: "Works fully offline. Data stays on this computer." },
  hybrid: { icon: "sync", title: "This PC + Google Sheets", sub: "Works offline, syncs automatically when online.", badge: "Recommended" },
  sheets: { icon: "cloud", title: "Google Sheets live", sub: "Every action goes straight to the sheet. Needs internet." },
};

const CODE_URL = "apps-script/Code.gs";
// Served by the preview host (src/app/download/…). Hidden automatically when the POS is hosted elsewhere.
const WINDOWS_KIT_URL = "/download/freshmart-pos-windows.zip";
let kitCheck = null;
const windowsKitAvailable = () =>
  (kitCheck ||= navigator.onLine
    ? fetch(WINDOWS_KIT_URL, { method: "HEAD", cache: "no-store" }).then((r) => r.ok, () => false)
    : Promise.resolve(false));
const fetchCode = async () => {
  const res = await fetch(CODE_URL, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) throw new Error("Couldn't load Code.gs");
  return res.text();
};
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}
const checkUrl = (url) => {
  if (!url) return "Paste your Web App URL first";
  if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/(exec|dev)$/.test(url)) {
    return "That doesn't look like an Apps Script Web App URL (https://script.google.com/macros/s/…/exec)";
  }
  if (url.endsWith("/dev")) return "Use the deployed URL ending in /exec, not /dev";
  return null;
};
function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = label;
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label;
  }
  btn.disabled = on;
}

let cleanup = [];
export function unmount() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
}
export function refresh() {
  /* the form is left untouched during background syncs */
}
const listen = (name, fn) => {
  window.addEventListener(name, fn);
  cleanup.push(() => window.removeEventListener(name, fn));
};

export async function mount(el) {
  unmount();
  const cfg = getConfig();
  let selected = cfg.mode;

  el.innerHTML = `
  <div class="view-enter">
    <div class="page-head">
      <div><h2>Settings</h2><p>Choose where your data lives, set up offline use, and edit the store details on receipts.</p></div>
      <div class="actions"><button class="btn btn-primary" id="setSave">${icon("check")} Save store details</button></div>
    </div>
    <div class="settings-grid">
      <div style="display:grid;gap:16px;min-width:0">
        <div class="card card-pad" id="dsCard">
          <div class="sec-head"><span class="stat-icon green">${icon("layers", "lg")}</span>
            <div><h3>Data storage &amp; sync</h3><div class="muted">Where products, stock and invoices are kept</div></div></div>
          <div class="mode-grid" id="modeGrid"></div>
          <div id="modePanel"></div>
        </div>

        <div class="card card-pad" id="offlineCard"></div>
        <div class="card card-pad" id="backupCard"></div>
        <div class="card card-pad" id="transferCard"></div>

        <form class="card card-pad" id="setForm" autocomplete="off">
          <div class="sec-head"><span class="stat-icon green">${icon("store", "lg")}</span><div><h3>Store profile</h3><div class="muted">Appears in the receipt header</div></div></div>
          <div class="form-grid">
            <div class="field span-2"><label>Store name</label><input class="input" name="storeName" required value="${esc(state.settings.storeName)}" /></div>
            <div class="field span-2"><label>Address</label><input class="input" name="address" value="${esc(state.settings.address)}" /></div>
            <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(state.settings.phone)}" /></div>
            <div class="field"><label>Tax / GST / VAT ID</label><input class="input" name="taxId" value="${esc(state.settings.taxId)}" /></div>
            <div class="field"><label>Currency symbol</label><input class="input" name="currency" maxlength="4" value="${esc(state.settings.currency)}" /></div>
            <div class="field"><label>Tax label</label><input class="input" name="taxLabel" maxlength="12" value="${esc(state.settings.taxLabel)}" placeholder="Tax, GST, VAT…" /></div>
            <div class="field span-2"><label>QR payment ID <span class="muted">(optional, e.g. UPI VPA)</span></label><input class="input" name="upiId" value="${esc(state.settings.upiId || "")}" placeholder="store@bank" /><span class="hint">Used to generate the “UPI / QR” payment code at checkout.</span></div>
            <div class="field span-2"><label>Receipt footer message</label><textarea class="textarea" name="receiptFooter" rows="2">${esc(state.settings.receiptFooter)}</textarea></div>
          </div>
          <div class="sec-head" style="margin:22px 0 14px"><span class="stat-icon violet">${icon("palette", "lg")}</span><div><h3>Appearance</h3><div class="muted">Your store's colours and how products are pictured</div></div></div>
          <div class="form-grid">
            <div class="field span-2"><label>Brand colour <span class="muted">(buttons, icons &amp; highlights)</span></label>
              <div class="swatches" id="swatches">
                ${THEME_PRESETS.map(([c, n]) => `<button type="button" class="swatch" data-color="${c}" title="${n}" style="--c:${c}"></button>`).join("")}
                <label class="swatch custom" title="Pick any colour"><input type="color" id="colorPick" value="${normalizeColor(state.settings.themeColor)}" /></label>
                <input class="input input-sm mono" id="colorHex" name="themeColor" value="${normalizeColor(state.settings.themeColor)}" maxlength="7" spellcheck="false" style="width:104px" />
              </div></div>
            <div class="field"><label>Side menu style</label>
              <div class="segmented full" id="sbSeg">${[["light", "Light"], ["brand", "Brand colour"], ["dark", "Dark"]]
                .map(([v, l]) => `<label class="seg"><input type="radio" name="sidebarTheme" value="${v}" ${(state.settings.sidebarTheme || "light") === v ? "checked" : ""} />${l}</label>`)
                .join("")}</div></div>
            <div class="field"><label>Product pictures</label>
              <div class="segmented full" id="imgSeg">${[["emoji", "Emoji"], ["photo", "Photos"]]
                .map(([v, l]) => `<label class="seg"><input type="radio" name="productImageMode" value="${v}" ${(state.settings.productImageMode || "emoji") === v ? "checked" : ""} />${l}</label>`)
                .join("")}</div>
              <span class="hint">With Photos, add a picture to each product in <b>Inventory ▸ Edit</b> — from this PC, a web link or Google Drive. Products without a photo keep their emoji.</span></div>
          </div>
        </form>

        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:14px">Keyboard shortcuts</h3>
          <div class="shortcut-list">
            <div><span>Focus product search / scanner input</span><span><span class="kbd">F2</span> or <span class="kbd">/</span></span></div>
            <div><span>Open camera scanner</span><span class="kbd">F4</span></div>
            <div><span>Hold current order</span><span class="kbd">F8</span></div>
            <div><span>Take payment</span><span class="kbd">F9</span></div>
            <div><span>Close dialogs</span><span class="kbd">Esc</span></div>
          </div>
          <p class="muted" style="margin-top:14px">USB and Bluetooth barcode / QR scanners work out of the box: click the POS search box and scan.</p>
        </div>
      </div>

      <div class="card preview-card">
        <div class="card-head"><div><h3>Receipt preview</h3><div class="sub">Updates as you type</div></div></div>
        <div class="card-body"><div class="receipt-stage" id="setPreview" style="border-radius:14px"></div></div>
      </div>
    </div>
  </div>`;
  hydrateIcons(el);

  /* ================= storage mode ================= */
  function renderModes() {
    $("#modeGrid", el).innerHTML = Object.entries(MODES)
      .map(
        ([k, m]) => `
      <button class="mode-card ${selected === k ? "selected" : ""}" data-mode="${k}">
        <span class="mode-ic">${icon(m.icon, "lg")}</span>
        <b>${m.title}</b><span class="muted">${m.sub}</span>
        ${cfg.mode === k ? '<span class="badge badge-green mode-badge">Current</span>' : m.badge ? `<span class="badge badge-blue plain mode-badge">${m.badge}</span>` : ""}
      </button>`,
      )
      .join("");
    renderPanel();
  }

  function sheetFields() {
    return `
      <div class="form-grid" style="margin-top:14px">
        <div class="field span-2"><label>Apps Script Web App URL</label>
          <input class="input" id="dsUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cfg.url || "")}" spellcheck="false" /></div>
        <div class="field span-2"><label>Access key <span class="muted">(only if you set API_KEY in the script)</span></label>
          <input class="input" id="dsKey" type="password" autocomplete="off" placeholder="optional" value="${esc(cfg.key || "")}" /></div>
      </div>`;
  }
  const guide = (open) => `
    <details class="guide" ${open ? "open" : ""}>
      <summary>How to set up the Google Sheet <span class="muted">(2 minutes, no coding)</span></summary>
      <ol class="steps">
        <li>Create a new <b>Google Sheet</b>.</li>
        <li>Open <b>Extensions ▸ Apps Script</b>, delete the sample code and paste the backend script.
          <div class="step-actions"><button class="btn btn-sm btn-outline" data-act="copyCode">${icon("list", "sm")} Copy Code.gs</button>
          <button class="btn btn-sm btn-ghost" data-act="dlCode">${icon("download", "sm")} Download</button></div></li>
        <li><b>Deploy ▸ New deployment ▸ Web app</b> — <b>Execute as: Me</b>, <b>Who has access: Anyone</b> — then Deploy and authorise.</li>
        <li>Copy the <b>Web app URL</b> (ends in <span class="mono">/exec</span>), paste it above and connect.</li>
      </ol>
      <p class="muted" style="font-size:12.5px">Tabs <span class="mono">Products, Sales, SaleItems, StockMovements, Settings, SyncLog</span> are created automatically.
      Already using an older script? Paste the new Code.gs and redeploy as a <b>New version</b> to enable offline sync.</p>
    </details>`;

  function scriptNotice() {
    if (cfg.mode === "local" || selected !== cfg.mode || scriptUpToDate()) return "";
    return `<div class="sync-error" style="margin-top:14px;align-items:flex-start">${icon("alert", "sm")}<div>Your Google Apps Script is ${state.meta.scriptVersion ? "version " + esc(state.meta.scriptVersion) : "an older version"}.
      Paste the latest <b>Code.gs</b> into Apps Script and choose <b>Deploy ▸ Manage deployments ▸ Edit ▸ New version</b> to enable demo data, bulk import, product photos on Google Drive and syncing of store colours.
      <div class="btn-row" style="margin-top:8px"><button class="btn btn-sm btn-outline" data-act="copyCode">Copy Code.gs</button></div></div></div>`;
  }

  function renderPanel() {
    const panel = $("#modePanel", el);
    const isCurrent = selected === cfg.mode;
    if (selected === "local") {
      panel.innerHTML = isCurrent
        ? `<div class="mode-note">${icon("monitor")}<div>All data is saved in this browser's storage on this PC and works without internet.
             Add a folder backup below for extra safety, or connect Google Sheets to back up and share data between counters.</div></div>
           <div class="btn-row"><button class="btn btn-outline" data-act="resetDemo">Reset to sample data</button>
             <button class="btn btn-danger-soft" data-act="startFresh">Start with an empty store</button></div>`
        : `<div class="mode-note">${icon("monitor")}<div>The POS will use the data saved on this PC. Your Google Sheet is not changed and you can reconnect any time.
             ${cfg.mode === "hybrid" && (currentStatus() || {}).pending ? `<b>${currentStatus().pending} change(s) haven't synced yet</b> — they stay queued and are sent when you switch back.` : ""}</div></div>
           <div class="btn-row"><button class="btn btn-primary" data-act="useLocal">${icon("check")} Use this PC only</button></div>`;
    } else if (selected === "hybrid") {
      panel.innerHTML = `
        ${scriptNotice()}
        ${isCurrent ? `<div id="syncPanel"></div>` : `<div class="mode-note">${icon("sync")}<div>Sales, stock and products are saved on this PC first, so billing never waits for the internet.
          Changes sync to your sheet in the background, and updates from other counters are downloaded every minute.</div></div>`}
        ${sheetFields()}
        <div class="field" style="margin-top:14px;max-width:320px"><label>Counter ID <span class="muted">(used in invoice numbers)</span></label>
          <div class="input-group"><input class="input" id="devCode" maxlength="6" value="${esc(getDevice().code)}" /><button class="btn btn-outline" data-act="saveDev" style="border-radius:0 12px 12px 0;border-left:0">Save</button></div>
          <span class="hint">Give each till a different ID, e.g. C1, C2. Invoices look like INV-20250101-<b>${esc(getDevice().code)}</b>-0001.</span></div>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="connect" data-mode="hybrid">${icon("check")} ${isCurrent ? "Update &amp; sync" : "Connect &amp; work offline-first"}</button>
          <button class="btn btn-outline" data-act="test">Test connection</button>
        </div>
        ${guide(!isCurrent && cfg.mode === "local")}`;
      if (isCurrent) renderSyncPanel();
    } else {
      panel.innerHTML = `
        ${scriptNotice()}
        <div class="mode-note">${icon("cloud")}<div>Every sale is checked against the sheet at the moment of sale — useful when several counters must never oversell the last item.
          <b>Billing stops when the internet is down.</b> Choose “This PC + Google Sheets” to keep selling offline.</div></div>
        ${sheetFields()}
        <div class="btn-row">
          <button class="btn btn-primary" data-act="connect" data-mode="sheets">${icon("check")} ${isCurrent ? "Update &amp; sync" : "Use Google Sheets live"}</button>
          <button class="btn btn-outline" data-act="test">Test connection</button>
          ${isCurrent && state.meta.spreadsheetUrl ? `<a class="btn btn-ghost" href="${esc(state.meta.spreadsheetUrl)}" target="_blank" rel="noopener">Open sheet ↗</a>` : ""}
        </div>
        ${guide(false)}`;
    }
  }

  function renderSyncPanel() {
    const box = $("#syncPanel", el);
    if (!box) return;
    const st = currentStatus() || {};
    const online = navigator.onLine;
    const stateLabel = st.syncing ? "Syncing…" : !online ? "Offline" : st.lastError ? "Sync issue" : st.pending ? "Waiting to sync" : "Up to date";
    const cls = st.syncing ? "blue" : !online ? "amber" : st.lastError ? "red" : st.pending ? "amber" : "green";
    const log = st.log || [];
    box.innerHTML = `
      <div class="sync-panel">
        <div class="sync-stats">
          <div><span class="muted">Status</span><b><span class="badge badge-${cls}">${stateLabel}</span></b></div>
          <div><span class="muted">Waiting to sync</span><b>${st.pending || 0} change${st.pending === 1 ? "" : "s"}</b></div>
          <div><span class="muted">Last sync</span><b>${esc(timeAgo(st.lastSyncAt))}</b></div>
          <div><span class="muted">Sheet</span><b class="ellipsis">${state.meta.spreadsheetUrl ? `<a href="${esc(state.meta.spreadsheetUrl)}" target="_blank" rel="noopener">${esc(state.meta.spreadsheetName || "Open")} ↗</a>` : "—"}</b></div>
        </div>
        ${st.lastError && online ? `<div class="sync-error">${icon("alert", "sm")} ${esc(st.lastError)}</div>` : ""}
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn-soft" data-act="syncNow" ${online && !st.syncing ? "" : "disabled"}>${icon("refresh", "sm")} Sync now</button>
        </div>
        ${
          log.length
            ? `<div class="sync-log"><div class="sync-log-head"><b>Sync notes</b><button class="link-btn" data-act="clearLog">Clear</button></div>
              ${log
                .slice(0, 8)
                .map(
                  (l) => `<div class="sync-log-row ${l.level}">${icon(l.level === "error" ? "x" : "alert", "sm")}<div><b>${esc(l.summary)}</b><span>${esc(l.message || "")}</span></div><span class="muted">${esc(timeAgo(l.at))}</span></div>`,
                )
                .join("")}</div>`
            : ""
        }
      </div>`;
    hydrateIcons(box);
  }

  /* ================= offline / install ================= */
  async function renderOffline() {
    const box = $("#offlineCard", el);
    const info = await storageInfo();
    const standalone = pwa.installed;
    const secure = window.isSecureContext;
    box.innerHTML = `
      <div class="sec-head"><span class="stat-icon blue">${icon("install", "lg")}</span>
        <div><h3>Desktop app &amp; offline</h3><div class="muted">Install on Windows and open it like any other program — even without internet</div></div></div>
      <div class="status-list">
        <div class="status-row"><span class="status-ic ${standalone ? "ok" : ""}">${icon(standalone ? "check" : "monitor", "sm")}</span>
          <div><b>${standalone ? "Running as an installed app" : "Install as an app"}</b>
          <span>${standalone ? "FreshMart POS has its own window, Start-menu entry and taskbar icon." : pwa.installable ? "Adds FreshMart POS to the Start menu and desktop, opens in its own window." : "In Microsoft Edge: <b>⋯ ▸ Apps ▸ Install this site as an app</b>. In Chrome: <b>⋮ ▸ Cast, save and share ▸ Install page as app</b>."}</span></div>
          ${!standalone && pwa.installable ? `<button class="btn btn-sm btn-primary" data-act="install">${icon("install", "sm")} Install</button>` : ""}</div>
        <div class="status-row"><span class="status-ic ${pwa.swReady ? "ok" : ""}">${icon(pwa.swReady ? "check" : "wifiOff", "sm")}</span>
          <div><b>${pwa.swReady ? "Ready to start without internet" : secure ? "Preparing offline files…" : "Offline start unavailable"}</b>
          <span>${pwa.swReady ? "The app's files are saved on this PC, so it opens even when you're offline." : secure ? "This finishes in a few seconds." : "Offline start needs the app to be served over HTTPS (or localhost)."}</span></div></div>
        <div class="status-row"><span class="status-ic ${info.persisted ? "ok" : ""}">${icon(info.persisted ? "check" : "alert", "sm")}</span>
          <div><b>${info.persisted ? "Data is kept permanently" : "Protect data on this PC"}</b>
          <span>Using ${fmtBytes(info.usage)}${info.quota ? ` of ${fmtBytes(info.quota)} available` : ""}. ${info.persisted ? "The browser won't clear it to free up space." : "Ask the browser never to clear POS data when disk space runs low."}</span></div>
          ${!info.persisted && info.supported ? `<button class="btn btn-sm btn-outline" data-act="persist">Keep permanently</button>` : ""}</div>
        <div class="status-row"><span class="status-ic">${icon("layers", "sm")}</span>\n          <div><b>Local database: browser-managed IndexedDB</b>\n          <span>In “This PC + Google Sheets” mode, the sheet snapshot, offline changes and sync queue are stored in this browser profile. The website cannot choose the physical database folder. Chrome/Edge users can see the Profile Path in <span class="mono">chrome://version</span> or <span class="mono">edge://version</span>. Use <b>Backups ▸ Choose folder…</b> for a location you control.</span></div></div>\n        ${
          (await windowsKitAvailable())
            ? `<div class="status-row"><span class="status-ic ok">${icon("monitor", "sm")}</span>
          <div><b>Run on another Windows PC (Windows 7 or newer)</b>
          <span>Download the Windows kit: extract it, double-click <span class="mono">Start FreshMart POS.bat</span>, then install the app. No extra software needed — see README-WINDOWS.txt inside.</span></div>
          <a class="btn btn-sm btn-outline" href="${WINDOWS_KIT_URL}" download>${icon("download", "sm")} Windows kit</a></div>`
            : ""
        }
      </div>`;
  }

  /* ================= backups ================= */
  async function renderBackup() {
    const box = $("#backupCard", el);
    const mode = getConfig().mode;
    const fs = await folderState();
    const sheetsOnly = mode === "sheets";
    let folderHtml;
    if (sheetsOnly) {
      folderHtml = `<div class="mode-note">${icon("cloud")}<div>In “Google Sheets live” mode your data lives in the sheet — use <b>File ▸ Version history</b> in Google Sheets for backups.</div></div>`;
    } else if (!folderSupported) {
      folderHtml = `<div class="mode-note">${icon("folder")}<div>Automatic folder backups need Microsoft Edge or Google Chrome. You can still download a backup file below.</div></div>`;
    } else if (!fs.connected) {
      folderHtml = `<div class="status-row"><span class="status-ic">${icon("folder", "sm")}</span>
        <div><b>Back up to a folder on this PC</b><span>Pick a folder (e.g. <span class="mono">Documents\\FreshMart POS</span> or a OneDrive folder). The POS keeps <span class="mono">FreshMart-POS-data.json</span> up to date plus 14 days of daily backups — including sales that haven't synced yet.</span></div>
        <button class="btn btn-sm btn-primary" data-act="chooseFolder">${icon("folder", "sm")} Choose folder…</button></div>`;
    } else {
      const needsPerm = fs.permission !== "granted";
      folderHtml = `<div class="status-row"><span class="status-ic ${needsPerm || fs.lastError ? "" : "ok"}">${icon(needsPerm ? "alert" : "folder", "sm")}</span>
        <div><b>Backing up to “${esc(fs.name)}”</b><span>${needsPerm ? "Windows needs your OK again after a restart — click Reconnect." : fs.lastError ? esc(fs.lastError) : `Last saved ${esc(timeAgo(fs.lastWrite))}.`}</span></div>
        <div class="btn-row tight">${needsPerm ? `<button class="btn btn-sm btn-primary" data-act="reconnectFolder">Reconnect</button>` : `<button class="btn btn-sm btn-soft" data-act="backupNow">Back up now</button>`}
          <button class="btn btn-sm btn-ghost" data-act="chooseFolder">Change</button><button class="btn btn-sm btn-ghost" data-act="forgetFolder">Stop</button></div></div>`;
    }
    box.innerHTML = `
      <div class="sec-head"><span class="stat-icon amber">${icon("folder", "lg")}</span>
        <div><h3>Backups</h3><div class="muted">Extra copies of your data on this PC</div></div></div>
      <div class="status-list">${folderHtml}</div>
      ${
        sheetsOnly
          ? ""
          : `<div class="btn-row" style="margin-top:14px">
              <button class="btn btn-outline" data-act="downloadBackup">${icon("download", "sm")} Download backup file</button>
              <label class="btn btn-ghost" style="cursor:pointer">${icon("undo", "sm")} Restore from file…<input type="file" accept=".json,application/json" id="restoreFile" hidden /></label>
            </div>`
      }`;
    const rf = $("#restoreFile", box);
    if (rf) rf.addEventListener("change", onRestore);
  }

  async function onRestore(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast("That file isn't a valid backup", "error");
    }
    const mode = getConfig().mode;
    const msg =
      mode === "local"
        ? "All data on this PC will be replaced by the backup. This can't be undone."
        : "Changes in the backup that the sheet doesn't have yet will be queued and synced. Nothing is overwritten.";
    if (!(await confirmDialog({ title: `Restore “${file.name}”?`, message: msg, confirmText: "Restore", danger: mode === "local" }))) return;
    try {
      const r = await backend.importData(data);
      await reloadLocal();
      toast(mode === "local" ? "Backup restored" : `Restored — ${r.restored} change(s) queued for sync`);
      mount(el);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  /* ================= import & export ================= */
  function renderTransfer() {
    const box = $("#transferCard", el);
    const mode = getConfig().mode;
    box.innerHTML = `
      <div class="sec-head"><span class="stat-icon blue">${icon("upload", "lg")}</span>
        <div><h3>Import &amp; export</h3><div class="muted">Move data in and out — works in every storage mode</div></div></div>
      <div class="transfer-grid">
        <div class="transfer-col"><b>Export</b>
          <button class="btn btn-outline btn-sm" data-act="exportJson">${icon("download", "sm")} All data (.json)</button>
          <button class="btn btn-outline btn-sm" data-act="exportProducts">${icon("download", "sm")} Products (.csv)</button>
          <button class="btn btn-outline btn-sm" data-act="exportInvoices">${icon("download", "sm")} Invoices (.csv)</button>
          <button class="btn btn-outline btn-sm" data-act="exportLines">${icon("download", "sm")} Invoice lines (.csv)</button>
        </div>
        <div class="transfer-col"><b>Import</b>
          <label class="btn btn-outline btn-sm">${icon("upload", "sm")} Data file (.json)…<input type="file" id="importJson" accept=".json,application/json" hidden /></label>
          <button class="btn btn-outline btn-sm" data-act="importCsv">${icon("upload", "sm")} Products (.csv)…</button>
          <button class="btn btn-primary btn-sm" data-act="loadDemo">${icon("layers", "sm")} Load demo data</button>
          <span class="hint">Demo: 52 sample products + 2 weeks of sample bills, so the dashboard, charts, top products, low-stock alerts and recent transactions are all filled in.</span>
        </div>
      </div>
      <p class="muted" style="font-size:12.5px;margin-top:12px">Imports only add what's missing — products are matched by SKU and invoices by invoice number — so importing the same file twice never creates duplicates.
      ${mode === "local" ? "" : "Imported data is written straight to your Google Sheet."} Spreadsheets open in Excel or Google Sheets (₹ shown correctly).</p>`;
    $("#importJson", box).addEventListener("change", onImportJson);
  }

  function checkCloudImport() {
    if (getConfig().mode === "local" || scriptUpToDate()) return true;
    toast("Update your Apps Script to Code.gs v1.2 first (see Data storage & sync above)", "error");
    return false;
  }

  async function onImportJson(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !checkCloudImport()) return;
    let payload;
    try {
      payload = toPortable(JSON.parse(await file.text()));
    } catch (err) {
      return toast(err.message && !/JSON/.test(err.message) ? err.message : "That file isn't a valid FreshMart POS data file", "error");
    }
    const choice = await choiceDialog({
      title: `Import “${file.name}”?`,
      message: `${payload.products.length} products and ${payload.sales.length} invoices found. Anything already in your store is skipped.`,
      choices: [
        { value: "data", label: "Import products & invoices", primary: true },
        ...(payload.settings ? [{ value: "all", label: "Import products, invoices and store settings", sub: "Also replaces store name, address, colours, currency…" }] : []),
      ],
    });
    if (!choice) return;
    try {
      toast("Importing… please wait", "success");
      const r = await importBulk({ products: payload.products, sales: payload.sales, settings: choice === "all" ? payload.settings : undefined });
      toast(`Imported ${r.productsAdded} products and ${r.salesAdded} invoices${r.productsSkipped + r.salesSkipped ? ` · ${r.productsSkipped + r.salesSkipped} already present` : ""}`);
      mount(el);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  /* ================= actions ================= */
  const inputs = () => ({ url: ($("#dsUrl", el)?.value || "").trim(), key: ($("#dsKey", el)?.value || "").trim() });

  async function afterConnectEmptySheet(features = []) {
    if (state.all.length) return;
    const bulk = features.includes("bulk");
    const local = await peekLocalDb();
    const localCount = local ? local.products.length : 0;
    const choice = await choiceDialog({
      title: "Your sheet has no products yet",
      message: "How would you like to start?",
      choices: [
        ...(localCount ? [{ value: "local", label: `Upload ${localCount} products from this PC`, sub: "Copies the catalogue you've been using here (stock levels included)", primary: true }] : []),
        ...(bulk ? [{ value: "demo", label: "Load the full demo", sub: "52 products + 2 weeks of sample bills — the dashboard is ready to show", primary: !localCount }] : []),
        { value: "sample", label: "Load the sample products only", sub: "52 products, no sales history", primary: !localCount && !bulk },
        { value: "empty", label: "Start empty", sub: "Add products or import a CSV from Inventory" },
      ],
    });
    if (choice === "local") {
      const r = await importProducts(local.products.map(({ id, createdAt, updatedAt, ...p }) => p)); // eslint-disable-line no-unused-vars
      toast(`Added ${r.products.length} products`);
    } else if (choice === "demo") {
      toast("Loading demo data into your sheet… this takes a few seconds", "success");
      const r = await importBulk(demoPayload());
      toast(`Demo ready: ${r.productsAdded} products and ${r.salesAdded} sample bills added`);
    } else if (choice === "sample") {
      const r = await importProducts(sampleProducts());
      toast(`Added ${r.products.length} sample products`);
    }
  }

  async function connect(btn, mode) {
    const { url, key } = inputs();
    const bad = checkUrl(url);
    if (bad) return toast(bad, "error");
    busy(btn, true, "Connecting…");
    const previous = getConfig();
    try {
      const info = await createSheetsAdapter({ url, key }).ping();
      if (mode === "hybrid" && !(info.features || []).includes("sync")) {
        throw new Error("Your Apps Script is an older version. Paste the latest Code.gs into Apps Script and deploy a New version, then try again.");
      }
      saveConfig({ mode, url, key });
      await loadAll();
      if (mode === "hybrid") requestPersist();
      window.dispatchEvent(new CustomEvent("settings:changed"));
      toast(mode === "hybrid" ? `Connected to “${info.spreadsheetName}” — works offline, syncs automatically` : `Connected to “${info.spreadsheetName}”`);
      await afterConnectEmptySheet(info.features || []);
      mount(el);
    } catch (err) {
      saveConfig(previous);
      await loadAll().catch(() => {});
      toast(err.message, "error");
      busy(btn, false);
    }
  }

  const onClick = async (e) => {
    const card = e.target.closest("[data-mode].mode-card");
    if (card) {
      selected = card.dataset.mode;
      renderModes();
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      if (act === "connect") await connect(btn, btn.dataset.mode);
      else if (act === "test") {
        const { url, key } = inputs();
        const bad = checkUrl(url);
        if (bad) return toast(bad, "error");
        busy(btn, true, "Testing…");
        try {
          const info = await createSheetsAdapter({ url, key }).ping();
          const syncOk = (info.features || []).includes("sync");
          toast(`Connected to “${info.spreadsheetName}”${syncOk ? "" : " — update Code.gs to enable offline sync"}`, syncOk ? "success" : "warn");
        } finally {
          busy(btn, false);
        }
      } else if (act === "useLocal") {
        if (!(await confirmDialog({ title: "Use this PC only?", message: "The POS will switch to the data stored on this computer. Your Google Sheet isn't changed.", confirmText: "Switch" }))) return;
        saveConfig({ ...getConfig(), mode: "local" });
        await loadAll();
        requestPersist();
        window.dispatchEvent(new CustomEvent("settings:changed"));
        toast("Now using data stored on this PC");
        mount(el);
      } else if (act === "resetDemo" || act === "startFresh") {
        const fresh = act === "startFresh";
        const ok = await confirmDialog({
          title: fresh ? "Start with an empty store?" : "Reset to sample data?",
          message: `All products, invoices and stock history on this PC will be ${fresh ? "deleted" : "replaced with sample data"}. Download a backup first if you might need them.`,
          confirmText: fresh ? "Delete everything" : "Reset",
          danger: true,
        });
        if (!ok) return;
        await backend[act]();
        await loadAll();
        window.dispatchEvent(new CustomEvent("settings:changed"));
        toast(fresh ? "Empty store ready — add products in Inventory" : "Sample data restored");
        mount(el);
      } else if (act === "saveDev") {
        const d = setDeviceCode($("#devCode", el).value);
        await loadAll();
        toast(`Counter ID set to ${d.code}`);
        mount(el);
      } else if (act === "syncNow") {
        busy(btn, true, "Syncing…");
        await backend.sync();
        await reloadLocal();
        const st = currentStatus() || {};
        toast(st.lastError ? st.lastError : "Synced with Google Sheets", st.lastError ? "error" : "success");
        renderSyncPanel();
      } else if (act === "clearLog") {
        await backend.clearLog();
        renderSyncPanel();
      } else if (act === "install") {
        await promptInstall();
        renderOffline();
      } else if (act === "persist") {
        const ok = await requestPersist();
        toast(ok ? "Data will be kept permanently" : "The browser declined — installing the app usually allows it", ok ? "success" : "warn");
        renderOffline();
      } else if (act === "chooseFolder") {
        try {
          const name = await chooseFolder();
          toast(`Backing up to “${name}”`);
        } catch (err) {
          if (err.name !== "AbortError") toast(err.message, "error");
        }
        renderBackup();
      } else if (act === "reconnectFolder") {
        toast((await reconnectFolder()) ? "Folder reconnected" : "Access not granted", "success");
        renderBackup();
      } else if (act === "backupNow") {
        toast((await writeNow()) ? "Backup saved" : "Backup failed", "success");
        renderBackup();
      } else if (act === "forgetFolder") {
        await forgetFolder();
        toast("Folder backups stopped (existing files are kept)");
        renderBackup();
      } else if (act === "downloadBackup") {
        const data = await backend.exportData();
        if (!data) return toast("Nothing to back up in this mode", "warn");
        const d = new Date();
        const name = `FreshMart-POS-backup-${d.toISOString().slice(0, 10)}.json`;
        downloadFile(name, JSON.stringify(data), "application/json");
      } else if (act === "copyCode") {
        toast((await copyText(await fetchCode())) ? "Code.gs copied — paste it into Apps Script" : "Couldn't copy — use Download instead");
      } else if (act === "exportJson") {
        const data = await buildExport();
        downloadFile(`FreshMart-POS-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), "application/json");
        toast(`Exported ${data.products.length} products and ${data.sales.length} invoices`);
      } else if (act === "exportProducts") {
        downloadFile(`products-${new Date().toISOString().slice(0, 10)}.csv`, await productsCsv(), "text/csv;charset=utf-8");
      } else if (act === "exportInvoices") {
        downloadFile(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, await invoicesCsv(), "text/csv;charset=utf-8");
      } else if (act === "exportLines") {
        downloadFile(`invoice-lines-${new Date().toISOString().slice(0, 10)}.csv`, await invoiceLinesCsv(), "text/csv;charset=utf-8");
      } else if (act === "importCsv") {
        const { openImportModal } = await import("./inventory.js");
        openImportModal({ onSaved: () => mount(el) });
      } else if (act === "loadDemo") {
        if (!checkCloudImport()) return;
        const ok = await confirmDialog({
          title: "Load demo data?",
          message: `Adds 52 sample products (existing SKUs are kept) and about 280 sample bills from the last 2 weeks${getConfig().mode === "local" ? "" : " to your Google Sheet"}. Great for showing the dashboard; delete the rows later if you don't need them.`,
          confirmText: "Load demo data",
        });
        if (!ok) return;
        busy(btn, true, "Loading demo…");
        try {
          const r = await importBulk(demoPayload());
          toast(`Demo ready: ${r.productsAdded} products and ${r.salesAdded} sample bills added`);
          location.hash = "#/dashboard";
        } finally {
          busy(btn, false);
        }
      } else if (act === "dlCode") {
        downloadFile("Code.gs", await fetchCode(), "text/plain");
      }
    } catch (err) {
      toast(err.message || "Something went wrong", "error");
    }
  };
  // mount() re-renders into the same element, so the handler must be removed on the next mount.
  el.addEventListener("click", onClick);
  cleanup.push(() => el.removeEventListener("click", onClick));

  listen("sync:status", renderSyncPanel);
  listen("online", renderSyncPanel);
  listen("offline", renderSyncPanel);
  listen("pwa:status", renderOffline);
  listen("backup:status", renderBackup);
  cleanup.push(() => applyTheme(state.settings)); // drop an unsaved colour preview when leaving

  /* ================= store profile ================= */
  const form = $("#setForm", el);
  const read = () => Object.fromEntries(new FormData(form).entries());
  const preview = () => {
    const prev = state.settings;
    state.settings = { ...prev, ...read() }; // money() formatting reads the live currency
    try {
      $("#setPreview", el).innerHTML = receiptHtml(SAMPLE_SALE, SAMPLE_ITEMS, state.settings);
    } finally {
      state.settings = prev;
    }
  };
  form.addEventListener("input", preview);
  const hexEl = $("#colorHex", el);
  const pickEl = $("#colorPick", el);
  const syncSwatches = () => {
    const c = normalizeColor(hexEl.value);
    el.querySelectorAll(".swatch[data-color]").forEach((b) => b.classList.toggle("active", b.dataset.color === c));
    el.querySelectorAll(".segmented .seg").forEach((l) => l.classList.toggle("active", l.querySelector("input").checked));
  };
  const livePreview = () => {
    const v = read();
    applyTheme({ ...state.settings, ...v, themeColor: normalizeColor(v.themeColor) });
    syncSwatches();
  };
  $("#swatches", el).addEventListener("click", (e) => {
    const b = e.target.closest(".swatch[data-color]");
    if (!b) return;
    hexEl.value = b.dataset.color;
    pickEl.value = b.dataset.color;
    livePreview();
  });
  pickEl.addEventListener("input", () => {
    hexEl.value = pickEl.value;
    livePreview();
  });
  hexEl.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(hexEl.value.trim())) pickEl.value = hexEl.value.trim().toLowerCase();
    livePreview();
  });
  form.addEventListener("change", livePreview);
  syncSwatches();
  let saving = false;
  const save = async () => {
    if (saving || !form.reportValidity()) return;
    saving = true;
    const btn = $("#setSave", el);
    btn.disabled = true;
    try {
      const values = read();
      values.themeColor = normalizeColor(values.themeColor);
      await saveSettings(values);
      applyTheme(state.settings);
      window.dispatchEvent(new CustomEvent("settings:changed"));
      toast(getConfig().mode === "hybrid" && !navigator.onLine ? "Saved on this PC — will sync when online" : "Store details saved");
      preview();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      saving = false;
      btn.disabled = false;
    }
  };
  $("#setSave", el).onclick = save;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    save();
  });

  renderModes();
  preview();
  renderOffline();
  renderBackup();
  renderTransfer();
}
