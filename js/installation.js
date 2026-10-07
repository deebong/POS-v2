// First-run POS installation/onboarding. Backend installation state is authoritative for cloud modes.
import { backend, getConfig, saveConfig } from "./data/backend.js";
import { uid } from "./data/logic.js";
import { peekLocalDb } from "./data/local-adapter.js";
import { provisionInitialAdmin } from "./staff.js";
import { saveSettings, state } from "./store.js";
import { LANGUAGE_OPTIONS } from "./i18n.js";
import { $, esc, hydrateIcons, icon, toast } from "./ui.js";

const MARKER = "pos.installation.v2";
const DEFAULT_MODE = "hybrid";
const DEFAULT_INSTALL = {
  storeName: "", address: "", phoneNumbers: [{ number: "", type: "voice", label: "" }],
  taxId: "", currency: "₹", taxLabel: "GST", upiId: "", upiQrUrl: "",
  themeColor: "#0f9d58", themeMode: "light", sidebarTheme: "light", productImageMode: "emoji", productLabelCode: "qr",
  language: "ta-en", logoUrl: "", brandLogoMode: "default", brandTagline: "Grocery POS", faviconUrl: "", receiptLogoUrl: "", receiptFooter: "Thank you for shopping with us! Please visit again.",
  mode: DEFAULT_MODE, url: "", key: "",
};

function getMarker() {
  try { return JSON.parse(localStorage.getItem(MARKER) || "null"); } catch { return null; }
}
function setMarker(data = {}) {
  const value = { version: 2, installed: true, installationId: data.installationId || uid(), installedAt: data.installedAt || new Date().toISOString(), mode: data.mode || getConfig().mode };
  localStorage.setItem(MARKER, JSON.stringify(value));
  return value;
}
export function installationMarker() { return getMarker(); }

function encodeStoreConfig(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeStoreConfig(value) {
  try {
    const b64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value || "").length + 3) % 4);
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}
export function applySharedStoreConfigFromUrl() {
  const token = new URLSearchParams(location.search).get("store");
  if (!token) return false;
  const data = decodeStoreConfig(token);
  if (!data || !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(String(data.url || ""))) return false;
  saveConfig({ mode: ["hybrid","sheets"].includes(data.mode) ? data.mode : "hybrid", url: data.url, key: String(data.key || "") });
  localStorage.setItem("pos.store.link.v1", location.href.split("?")[0] + "?store=" + token);
  return true;
}
export function clearInstallationMarker() { localStorage.removeItem(MARKER); }

function parsePhones(v) {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function cleanPhoneRows(rows) {
  return rows.map((x) => ({ number: String(x.number || "").trim().slice(0, 40), type: ["voice","whatsapp","both"].includes(x.type) ? x.type : "voice", label: String(x.label || "").trim().slice(0, 40) })).filter((x) => x.number);
}
async function readLogo(file, mode, name = "store-logo") {
  if (!file) return "";
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) throw new Error("Logo must be PNG, JPG, WebP or GIF.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Logo is too large. Maximum size is 3 MB.");
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(file);
  });
  if (mode === "local") return data;
  const res = await backend.uploadImage({ dataUrl: data, name });
  return res.url || data;
}

function css() {
  return `
  <style>
    .install-wrap{min-height:calc(100vh - 90px);display:grid;place-items:center;padding:24px}
    .install-card{width:min(980px,100%);background:var(--surface);border:1px solid var(--border);border-radius:24px;box-shadow:0 18px 60px rgba(15,27,45,.12);overflow:hidden}
    .install-head{padding:26px 30px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:20px;align-items:center}
    .install-head h2{margin:0;font-size:24px}.install-head p{margin:6px 0 0;color:var(--muted)}
    .install-progress{height:5px;background:var(--surface-2)}.install-progress>i{display:block;height:100%;background:var(--primary);transition:width .2s}
    .install-body{padding:28px 30px}.install-step{display:none}.install-step.active{display:block}
    .install-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.install-grid .span-2{grid-column:1/-1}
    .install-phone-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 130px 42px;gap:8px;align-items:end;margin-bottom:8px}
    .install-footer{padding:18px 30px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:10px}
    .install-choice{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.install-choice label{cursor:pointer}
    .install-choice input{position:absolute;opacity:0}.install-choice .choice-card{height:100%;border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--surface)}
    .install-choice input:checked+.choice-card{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 20%,transparent)}
    .install-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.install-summary .card{padding:14px}
    .install-success{text-align:center;max-width:760px;margin:0 auto;padding:46px 56px 54px}.install-success .big{font-size:48px;margin-bottom:14px}.install-success h2{margin-bottom:8px}.install-next-steps{margin:24px auto;max-width:560px;text-align:left;padding:18px 22px}
    .install-existing-notice{margin-top:14px;padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);color:var(--text-2)}
    .install-review-summary{margin-top:18px}.install-review-summary .card{min-height:68px}
    .install-file{height:54px;padding:6px 10px;line-height:40px}.install-file::file-selector-button{height:40px;margin-right:10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);font-weight:650;color:var(--text);vertical-align:middle}
    .install-segmented button{min-height:44px}.install-segmented button.active{background:var(--surface);color:var(--text);box-shadow:0 1px 4px rgba(15,27,45,.12)}
    @media(max-width:700px){.install-grid,.install-choice,.install-summary{grid-template-columns:1fr}.install-phone-row{grid-template-columns:1fr}.install-head,.install-body,.install-footer{padding:20px}.install-wrap{padding:10px}}
  </style>`;
}

export async function checkInstallation() {
  const cfg = getConfig();
  const marker = getMarker();
  if (marker?.installed) return { installed: true, marker };
  if (cfg.mode === "local") {
    const db = await peekLocalDb();
    if (db && ((db.products || []).length || (db.sales || []).length || db.settings?.storeName)) return { installed: true, marker: setMarker({ mode: "local" }) };
    return { installed: false };
  }
  try {
    const status = await backend.installationStatus();
    if (status?.installed) return { installed: true, marker: setMarker({ installationId: status.installationId, installedAt: status.installedAt, mode: cfg.mode }) };
  } catch (e) {
    return { installed: false, error: e.message || "Unable to check installation status." };
  }
  return { installed: false };
}

export async function showInstallationWizard(root = document.getElementById("view")) {
  const cfg = getConfig();
  let step = 0, busy = false, existingBackend = false, existingStatus = null;
  const data = { ...DEFAULT_INSTALL, ...state.settings, mode: cfg.url ? cfg.mode : DEFAULT_MODE, url: cfg.url || "", key: cfg.key || "", adminId: uid() };
  data.phoneNumbers = parsePhones(data.phoneNumbers);
  if (!data.phoneNumbers.length) data.phoneNumbers = [{ number: "", type: "voice", label: "" }];

  root.innerHTML = css() + `
    <div class="install-wrap"><section class="install-card">
      <div class="install-head"><div><h2>FreshMart POS Installation</h2><p id="installSubtitle">Set up this store once. The same public POS can then be used on other counters with the existing staff login.</p></div><span class="badge badge-green">First-time setup</span></div>
      <div class="install-progress"><i id="installProgress" style="width:25%"></i></div>
      <div class="install-body">
        <section class="install-step active" data-step="0"><h3>1. Store</h3><p class="muted">Store identity, contact lines and language.</p>
          <div class="install-grid">
            <div class="field span-2"><label>Store name</label><input class="input" id="iStore" required value="${esc(data.storeName)}"></div>
            <div class="field span-2"><label>Address</label><textarea class="textarea" id="iAddress" rows="2">${esc(data.address)}</textarea></div>
            <div class="field span-2"><label>Phone numbers</label><div id="iPhones"></div><button class="btn btn-ghost" id="addPhone" type="button">${icon("plus")} Add another number</button><span class="hint">Voice calls, WhatsApp, or both.</span></div>
            <div class="field"><label>Primary language</label><select class="select" id="iLanguage">${LANGUAGE_OPTIONS.map(x=>`<option value="${x.id}" ${data.language===x.id?"selected":""}>${esc(x.native)} — ${esc(x.label)}</option>`).join("")}</select></div>
            <div class="field"><label>Currency</label><input class="input" id="iCurrency" maxlength="4" value="${esc(data.currency || "₹")}"></div>
          </div>
        </section>

        <section class="install-step" data-step="1"><h3>2. Store access</h3><p class="muted">Choose whether this is a brand-new store backend or a device joining an existing store.</p>
          <div class="install-choice install-access-choice">
            <label><input type="radio" name="iInstallKind" value="new" checked><div class="choice-card"><b>New store</b><p class="muted">Create a new Google Sheets backend and the first Super Admin.</p></div></label>
            <label><input type="radio" name="iInstallKind" value="existing"><div class="choice-card"><b>Existing store / new device</b><p class="muted">Reconnect this device to a store already installed. Existing staff and data remain untouched.</p></div></label>
          </div>
          <div class="field" style="margin-top:18px"><label>Storage mode</label><select class="select" id="iMode"><option value="hybrid" ${data.mode==="hybrid"?"selected":""}>This PC + Google Sheets (recommended)</option><option value="sheets" ${data.mode==="sheets"?"selected":""}>Google Sheets only</option><option value="local" ${data.mode==="local"?"selected":""}>This PC only</option></select><span class="hint">Hybrid is recommended for a client counter because billing remains usable during internet outages.</span></div>
          <div id="iCloudFields"><div class="field" style="margin-top:18px"><label>Google Apps Script Web App URL</label><input class="input" id="iUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(data.url)}"><span class="hint">Use the store's existing /exec URL. A store access link can pre-fill this automatically on client devices.</span></div>
          <div class="field" style="margin-top:12px"><label>Optional API key</label><input class="input" id="iKey" type="password" value="${esc(data.key)}"><span class="hint">Only required if the Apps Script deployment uses an API key.</span></div>
          <div class="field" id="iSetupCodeWrap" style="margin-top:12px"><label>One-time setup code</label><input class="input" id="iSetupCode" type="password" autocomplete="off" value="${esc(data.setupCode || "")}" placeholder="Code from getAuthSetupCode()"><span class="hint">Only needed when creating a brand-new cloud store. Existing stores do not need a new code.</span></div>
          </div>
          <div id="iExistingNotice" class="install-existing-notice" hidden></div>
        </section>

        <section class="install-step" data-step="2"><h3>3. Super Admin</h3><p id="adminStepText" class="muted">For a new store, create the first Super Admin. For an existing store, existing staff credentials are retained.</p>
          <div id="newAdminFields" class="install-grid">
            <div class="field"><label>Full name</label><input class="input" id="iAdminName" value=""></div>
            <div class="field"><label>Username</label><input class="input" id="iAdminUser" value="admin" autocomplete="username"></div>
            <div class="field"><label>PIN</label><input class="input" id="iAdminPin" type="password" value="${esc(data.adminPin || "")}" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
            <div class="field"><label>Confirm PIN</label><input class="input" id="iAdminPin2" type="password" value="${esc(data.adminPin2 || "")}" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          </div>
          <div id="existingAdminNotice" class="install-existing-notice" hidden></div>
        </section>

        <section class="install-step" data-step="3"><h3>4. Payments, branding &amp; review</h3><p class="muted">Configure the client-facing appearance and receipt settings. These can be changed later by Super Admin.</p>
          <div class="install-grid">
            <div class="field"><label>Tax / GST / VAT ID</label><input class="input" id="iTaxId" value="${esc(data.taxId || "")}"></div>
            <div class="field"><label>Tax label</label><input class="input" id="iTaxLabel" value="${esc(data.taxLabel || "GST")}"></div>
            <div class="field span-2"><label>UPI ID</label><input class="input" id="iUpi" value="${esc(data.upiId || "")}" placeholder="store@bank"></div>
            <div class="field"><label>Brand name / tagline</label><input class="input" id="iBrandTagline" value="${esc(data.brandTagline || "Grocery POS")}" placeholder="Grocery POS"></div>
            <div class="field"><label>Brand colour</label><div class="install-color-row"><input class="input" id="iColorHex" value="${esc(data.themeColor || "#0f9d58")}" maxlength="7"><input id="iColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(data.themeColor||"")?data.themeColor:"#0f9d58"}"></div></div>
            <div class="field"><label>Branding style</label><div class="segmented full install-segmented" id="brandModeChoices"><button type="button" data-radio-group="iBrandLogoMode" data-value="default">Default icon + text</button><button type="button" data-radio-group="iBrandLogoMode" data-value="custom">Custom logo</button></div></div>
            <div class="field"><label>Overall appearance</label><div class="segmented full install-segmented" id="themeChoices"><button type="button" data-radio-group="iThemeMode" data-value="light">Light</button><button type="button" data-radio-group="iThemeMode" data-value="dark">Dark</button><button type="button" data-radio-group="iThemeMode" data-value="system">System</button></div></div>
            <div class="field"><label>Side menu style</label><div class="segmented full install-segmented" id="sidebarChoices"><button type="button" data-radio-group="iSidebarTheme" data-value="light">Light</button><button type="button" data-radio-group="iSidebarTheme" data-value="brand">Brand colour</button><button type="button" data-radio-group="iSidebarTheme" data-value="dark">Dark</button></div></div>
            <div class="field"><label>POS logo</label><input class="input install-file" id="iLogo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="hint">Used in the POS sidebar. Max 3 MB.</span></div>
            <div class="field"><label>Invoice / receipt logo</label><input class="input install-file" id="iReceiptLogo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="hint">Optional separate receipt logo.</span></div>
            <div class="field"><label>Favicon</label><input class="input install-file" id="iFavicon" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="hint">Browser tab and shortcut icon.</span></div>
            <div class="field"><label>Product pictures</label><select class="select" id="iImages"><option value="emoji" ${data.productImageMode==="photo"?"":"selected"}>Emoji</option><option value="photo" ${data.productImageMode==="photo"?"selected":""}>Photos</option></select></div>
            <div class="field"><label>Product code labels</label><select class="select" id="iLabelCode"><option value="qr" ${data.productLabelCode==="barcode"?"":"selected"}>QR code</option><option value="barcode" ${data.productLabelCode==="barcode"?"selected":""}>Barcode</option></select></div>
            <div class="field span-2"><label>Receipt footer</label><textarea class="textarea" id="iFooter" rows="2">${esc(data.receiptFooter || "")}</textarea></div>
          </div>
          <div id="iSummary" class="install-summary install-review-summary"></div>
        </section>
      </div>
      <div class="install-footer" id="installFooter"><button class="btn btn-outline" id="iBack" type="button" disabled>Back</button><div><button class="btn btn-primary" id="iNext" type="button">Next</button></div></div>
    </section></div>`;
  hydrateIcons(root);

  const renderPhones = () => {
    const box = $("#iPhones", root);
    box.innerHTML = data.phoneNumbers.map((p, i) => `
      <div class="install-phone-row" data-phone="${i}">
        <div class="field"><label>${i===0?"Number":""}</label><input class="input p-num" value="${esc(p.number)}" placeholder="+91 …"></div>
        <div class="field"><label>${i===0?"Use for":""}</label><select class="select p-type"><option value="voice" ${p.type==="voice"?"selected":""}>Voice calls</option><option value="whatsapp" ${p.type==="whatsapp"?"selected":""}>WhatsApp</option><option value="both" ${p.type==="both"?"selected":""}>Voice + WhatsApp</option></select></div>
        <div class="field"><label>${i===0?"Label":""}</label><input class="input p-label" value="${esc(p.label)}" placeholder="Support"></div>
        <button class="icon-btn" type="button" data-remove-phone="${i}" title="Remove">${icon("trash")}</button>
      </div>`).join("");
    hydrateIcons(box);
  };
  renderPhones();
  $("#addPhone", root).onclick = () => { data.phoneNumbers.push({ number:"", type:"voice", label:"" }); renderPhones(); };
  $("#iPhones", root).addEventListener("input", () => {
    [...root.querySelectorAll("[data-phone]")].forEach((row) => {
      const i = Number(row.dataset.phone);
      data.phoneNumbers[i] = { number: row.querySelector(".p-num").value, type: row.querySelector(".p-type").value, label: row.querySelector(".p-label").value };
    });
  });
  $("#iPhones", root).addEventListener("change", (e) => {
    const row=e.target.closest("[data-phone]"); if(!row)return;
    const i=Number(row.dataset.phone); data.phoneNumbers[i]={number:row.querySelector(".p-num").value,type:row.querySelector(".p-type").value,label:row.querySelector(".p-label").value};
  });
  $("#iPhones", root).addEventListener("click", (e) => {
    const b=e.target.closest("[data-remove-phone]"); if(!b)return;
    data.phoneNumbers.splice(Number(b.dataset.removePhone),1); if(!data.phoneNumbers.length)data.phoneNumbers.push({number:"",type:"voice",label:""}); renderPhones();
  });

  const getInstallKind = () => root.querySelector('input[name="iInstallKind"]:checked')?.value || "new";
  const syncMode = () => { data.mode = getInstallKind() === "existing" ? (data.mode === "local" ? "hybrid" : data.mode) : (data.mode || "hybrid"); };

  const updateSegmented = (group, value) => root.querySelectorAll(`[data-radio-group="${group}"]`).forEach((b) => b.classList.toggle("active", b.dataset.value === value));
  const setSegmented = (group, value) => {
    if (group === "iBrandLogoMode") data.brandLogoMode = value;
    if (group === "iThemeMode") data.themeMode = value;
    if (group === "iSidebarTheme") data.sidebarTheme = value;
    updateSegmented(group, value);
  };

  const refreshExistingUi = () => {
    const existing = existingBackend;
    $("#iExistingNotice",root).hidden = !existing;
    if (existing) $("#iExistingNotice",root).innerHTML = "<b>Existing store detected.</b><br>This device will reconnect to the existing Google Sheets store. Nothing will be re-initialized or overwritten.";
    $("#newAdminFields",root).style.display = existing ? "none" : "";
    $("#existingAdminNotice",root).hidden = !existing;
    if (existing) $("#existingAdminNotice",root).innerHTML = "<b>Existing Super Admin retained.</b><br>The existing staff accounts and PINs remain unchanged. Sign in with the existing credentials after connecting.";
    $("#adminStepText",root).textContent = existing ? "This store is already installed. The existing Super Admin and staff directory will not be changed." : "Create the first Super Admin for this new store.";
    $("#installSubtitle",root).textContent = existing ? "Existing store detected. Connect this device without changing the store backend." : "Set up this store once. The same public POS can then be used on other counters with the existing staff login.";
    $("#iNext",root).textContent = step === 3 ? (existing ? "Connect to existing store" : "Install POS") : "Next";
  };

  const syncCloudFields = () => {
    const mode=$("#iMode",root)?.value||data.mode||"hybrid";
    data.mode=mode;
    const cloud=mode!=="local";
    $("#iCloudFields",root).style.display=cloud?"":"none";
    if(!cloud){ existingBackend=false; existingStatus=null; }
  };
  const detectExistingBackend = async () => {
    collect();
    if (data.mode === "local" || !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(data.url)) {
      existingBackend=false; existingStatus=null; refreshExistingUi(); return;
    }
    try {
      saveConfig({mode:data.mode,url:data.url,key:data.key});
      existingStatus=await backend.installationStatus();
      existingBackend=!!existingStatus?.installed;
      if(existingBackend){
        if(existingStatus.storeName){ data.storeName=existingStatus.storeName; $("#iStore",root).value=existingStatus.storeName; }
        if(existingStatus.language){ data.language=existingStatus.language; $("#iLanguage",root).value=existingStatus.language; }
        if(["hybrid","sheets"].includes(existingStatus.mode)) { data.mode=existingStatus.mode; $("#iMode",root).value=existingStatus.mode; }
        const radio=root.querySelector('input[name="iInstallKind"][value="existing"]');
        if(radio) radio.checked=true;
      }
    } catch {
      existingBackend=false; existingStatus=null;
    }
    refreshExistingUi();
  };

  root.querySelectorAll('input[name="iInstallKind"]').forEach((r)=>r.addEventListener("change",()=>{refreshExistingUi();if(r.checked&&r.value==="existing")detectExistingBackend();}));
  $("#iMode",root).addEventListener("change",()=>{syncCloudFields();refreshExistingUi();});
  syncCloudFields();
  ["iBrandLogoMode","iThemeMode","iSidebarTheme"].forEach((group) => root.querySelectorAll(`[data-radio-group="${group}"]`).forEach((b) => b.addEventListener("click", () => setSegmented(group,b.dataset.value))));
  setSegmented("iBrandLogoMode",data.brandLogoMode||"default");
  setSegmented("iThemeMode",data.themeMode||"light");
  setSegmented("iSidebarTheme",data.sidebarTheme||"light");
  root.addEventListener("input",(e)=>{if(e.target.id==="iAdminPin")data.adminPin=e.target.value;if(e.target.id==="iAdminPin2")data.adminPin2=e.target.value;});

  const collect = () => {
    data.storeName=$("#iStore",root).value.trim(); data.address=$("#iAddress",root).value.trim();
    data.phoneNumbers=cleanPhoneRows(data.phoneNumbers); data.language=$("#iLanguage",root).value; data.currency=$("#iCurrency",root).value.trim()||"₹";
    data.adminName=$("#iAdminName",root)?.value.trim()||data.adminName||""; data.adminUsername=$("#iAdminUser",root)?.value.trim().toLowerCase()||data.adminUsername||"";
    data.adminPin=$("#iAdminPin",root)?.value||data.adminPin||""; data.adminPin2=$("#iAdminPin2",root)?.value||data.adminPin2||"";
    data.taxId=$("#iTaxId",root).value.trim(); data.taxLabel=$("#iTaxLabel",root).value.trim()||"GST"; data.upiId=$("#iUpi",root).value.trim();
    data.themeColor=/^#[0-9a-f]{6}$/i.test($("#iColorHex",root).value.trim())?$("#iColorHex",root).value.trim():$("#iColor",root).value;
    data.brandTagline=$("#iBrandTagline",root)?.value.trim()||data.brandTagline||"Grocery POS";
    data.productLabelCode=$("#iLabelCode",root).value; data.productImageMode=$("#iImages",root).value; data.receiptFooter=$("#iFooter",root).value.trim();
    data.mode=$("#iMode",root)?.value||data.mode||"hybrid"; data.url=$("#iUrl",root).value.trim(); data.key=$("#iKey",root).value; data.setupCode=$("#iSetupCode",root)?.value.trim()||data.setupCode||"";
  };

  const validate = () => {
    collect();
    if (step===1 && getInstallKind()==="new" && !data.storeName) throw new Error("Store name is required.");
    if (step===1 && data.mode!=="local" && !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(data.url)) throw new Error("Enter the deployed Apps Script Web App URL ending in /exec.");
    if (step===1 && data.mode!=="local" && getInstallKind()==="new" && !data.setupCode) throw new Error("Enter the one-time setup code generated by getAuthSetupCode().");
    if (step===1 && data.mode!=="local" && getInstallKind()==="existing" && !existingBackend) throw new Error("This URL did not report an installed FreshMart POS store. Check the URL or choose New store.");
    if (step===2 && !existingBackend) {
      if (!data.adminName || !data.adminUsername) throw new Error("Super Admin name and username are required.");
      if (!/^\d{4,12}$/.test(data.adminPin||"")) throw new Error("Super Admin PIN must contain 4–12 digits.");
      if (data.adminPin !== data.adminPin2) throw new Error("PIN confirmation does not match.");
    }
    if (step===3 && !/^#[0-9a-f]{6}$/i.test(data.themeColor||"")) throw new Error("Choose a valid brand colour.");
    return true;
  };

  const renderStep = () => {
    const p=root.querySelector("#iAdminPin"), p2=root.querySelector("#iAdminPin2");
    if(p) data.adminPin=p.value; if(p2) data.adminPin2=p2.value;
    root.querySelectorAll(".install-step").forEach((x)=>x.classList.toggle("active",Number(x.dataset.step)===step));
    $("#installProgress",root).style.width=`${((step+1)/4)*100}%`;
    $("#iBack",root).disabled=step===0||busy;
    $("#iNext",root).textContent=step===3?(existingBackend?"Connect to existing store":"Install POS"):"Next";
    if(step===3){
      const items=[
        ["Store",data.storeName],["Language",LANGUAGE_OPTIONS.find(x=>x.id===data.language)?.label||data.language],
        ["Connection",existingBackend?"Existing store / reconnect":"New store / initialize"],
        ["Super Admin",existingBackend?"Existing account retained":(data.adminName+" (@"+data.adminUsername+")")],
        ["Tax",data.taxId||"Not configured"],["UPI",data.upiId||"Not configured"],
        ["Brand",data.brandTagline||"Grocery POS"],["Brand colour",data.themeColor],
        ["Appearance",data.themeMode||"light"],["Side menu",data.sidebarTheme||"light"],
        ["POS logo",data.logoUrl?"Configured":($("#iLogo",root)?.files?.[0]?"Selected":"Default")],
        ["Receipt logo",data.receiptLogoUrl?"Configured":($("#iReceiptLogo",root)?.files?.[0]?"Selected":"Default")]
      ];
      $("#iSummary",root).innerHTML=items.map(([a,b])=>`<div class="card"><div class="muted">${esc(a)}</div><b>${esc(b)}</b></div>`).join("");
    }
    refreshExistingUi();
  };

  const install = async () => {
    collect(); validate(); busy=true; $("#iNext",root).disabled=true; $("#iBack",root).disabled=true;
    try {
      if (!data.logoUrl && $("#iLogo",root)?.files?.[0]) data.logoUrl = await readLogo($("#iLogo",root).files[0], data.mode, "store-logo");
      if (!data.receiptLogoUrl && $("#iReceiptLogo",root)?.files?.[0]) data.receiptLogoUrl = await readLogo($("#iReceiptLogo",root).files[0], data.mode, "receipt-logo");
      if (!data.faviconUrl && $("#iFavicon",root)?.files?.[0]) data.faviconUrl = await readLogo($("#iFavicon",root).files[0], data.mode, "favicon");
      const settings={storeName:data.storeName,address:data.address,phoneNumbers:JSON.stringify(data.phoneNumbers),language:data.language,currency:data.currency,taxId:data.taxId,taxLabel:data.taxLabel,upiId:data.upiId,upiQrUrl:data.upiQrUrl||"",themeColor:data.themeColor,themeMode:data.themeMode,brandTagline:data.brandTagline,brandLogoMode:data.brandLogoMode,sidebarTheme:data.sidebarTheme,productImageMode:data.productImageMode,productLabelCode:data.productLabelCode,logoUrl:data.logoUrl||"",faviconUrl:data.faviconUrl||"",receiptLogoUrl:data.receiptLogoUrl||"",receiptFooter:data.receiptFooter};
      // Never initialize a cloud backend blindly. A client may have lost browser data while
      // the Google Sheet backend remains installed. Re-check immediately before initialization.
      if (data.mode !== "local" && /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(data.url)) {
        saveConfig({mode:data.mode,url:data.url,key:data.key});
        try {
          const liveStatus = await backend.installationStatus();
          if (liveStatus?.installed) {
            existingBackend = true;
            existingStatus = liveStatus;
          }
        } catch (probeError) {
          // Continue only if the backend probe itself failed; initialize will still be protected
          // by the explicit already-installed recovery below.
        }
      }
      if (existingBackend) {
        saveConfig({mode:data.mode,url:data.url,key:data.key});
        await backend.bootstrap();
        setMarker({mode:data.mode,installationId:existingStatus?.installationId||""});
        localStorage.setItem("pos.store.link.v1", location.href.split("?")[0] + "?store=" + encodeStoreConfig({url:data.url,key:data.key,mode:data.mode}));
        $("#installFooter",root).style.display="none";
        window.dispatchEvent(new CustomEvent("installation:complete"));
        return;
      }
      if (data.mode !== "local") {
        saveConfig({mode:data.mode,url:data.url,key:data.key});
        try {
          await backend.initialize({setupCode:data.setupCode,installation:{id:uid(),language:data.language,mode:data.mode},settings,admin:{id:data.adminId,name:data.adminName,username:data.adminUsername,phone:data.phoneNumbers[0]?.number||"",role:"admin",active:true,...await makeVerifier(data.adminPin)}});
        } catch (error) {
          // A backend can become installed between the probe and initialize. Treat the
          // authoritative server response as a reconnect signal, not a fatal installation error.
          if (!/already installed/i.test(String(error?.message || error))) throw error;
          existingBackend = true;
          existingStatus = await backend.installationStatus();
          await backend.bootstrap();
          setMarker({mode:data.mode,installationId:existingStatus?.installationId||""});
          localStorage.setItem("pos.store.link.v1", location.href.split("?")[0] + "?store=" + encodeStoreConfig({url:data.url,key:data.key,mode:data.mode}));
          $("#installFooter",root).style.display="none";
          window.dispatchEvent(new CustomEvent("installation:complete"));
          return;
        }
        const {onlineLogin}=await import("./auth.js");
        await onlineLogin(data.adminUsername,data.adminPin);
      } else {
        saveConfig({mode:"local",url:"",key:""});
        await backend.startFresh();
      }
      await saveSettings(settings);
      await provisionInitialAdmin({id:data.adminId,name:data.adminName,username:data.adminUsername,phone:data.phoneNumbers[0]?.number||"",pin:data.adminPin});
      setMarker({mode:data.mode});
      if(data.mode!=="local") localStorage.setItem("pos.store.link.v1", location.href.split("?")[0] + "?store=" + encodeStoreConfig({url:data.url,key:data.key,mode:data.mode}));
      $("#installFooter",root).style.display="none";
      window.dispatchEvent(new CustomEvent("installation:complete"));
    } catch(e) {
      toast(e.message||"Installation failed.","error");
    } finally { busy=false; $("#iNext",root).disabled=false; $("#iBack",root).disabled=false; }
  };

  async function makeVerifier(pin) {
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
    const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:120000,hash:"SHA-256"},key,256);
    const b64=btoa(String.fromCharCode(...new Uint8Array(bits)));
    const sb64=btoa(String.fromCharCode(...salt));
    return {pinSalt:sb64,pinHash:b64,pinIterations:120000,mustChangePin:false};
  }
  $("#iSwatches",root)?.addEventListener("click", (e) => {
    const b=e.target.closest("[data-install-color]"); if(!b)return;
    const c=b.dataset.installColor; $("#iColorHex",root).value=c; $("#iColor",root).value=c;
  });
  $("#iColor",root)?.addEventListener("input", e => { $("#iColorHex",root).value=e.target.value; });
  $("#iColorHex",root)?.addEventListener("input", e => { if(/^#[0-9a-f]{6}$/i.test(e.target.value.trim())) $("#iColor",root).value=e.target.value.trim(); });
  $("#iNext",root).onclick=async()=>{try{
    collect();
    if(step<3){
      if(step===1 && data.mode!=="local") await detectExistingBackend();
      validate();
      step++;
      if(step===2 && existingBackend) refreshExistingUi();
      renderStep();
    } else await install();
  }catch(e){toast(e.message,"error");}};
  $("#iBack",root).onclick=()=>{if(step>0&&!busy){step--;renderStep();}};
  renderStep();
  return true;
}
