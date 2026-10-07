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
  language: "ta-en", logoUrl: "", faviconUrl: "", receiptLogoUrl: "", receiptFooter: "Thank you for shopping with us! Please visit again.",
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
  let step = 0, busy = false;
  const data = { ...DEFAULT_INSTALL, ...state.settings, mode: cfg.url ? cfg.mode : DEFAULT_MODE, url: cfg.url || "", key: cfg.key || "", adminId: uid() };
  data.phoneNumbers = parsePhones(data.phoneNumbers);
  if (!data.phoneNumbers.length) data.phoneNumbers = [{ number: "", type: "voice", label: "" }];

  root.innerHTML = css() + `
    <div class="install-wrap"><section class="install-card">
      <div class="install-head"><div><h2>FreshMart POS Installation</h2><p>Set up this store once. The same public POS can then be used on other counters with the existing staff login.</p></div><span class="badge badge-green">First-time setup</span></div>
      <div class="install-progress"><i id="installProgress" style="width:16.67%"></i></div>
      <div class="install-body">
        <section class="install-step active" data-step="0"><h3>1. Store</h3><p class="muted">Store identity, contact lines and language. These can be changed later by Super Admin.</p>
          <div class="install-grid">
            <div class="field span-2"><label>Store name</label><input class="input" id="iStore" required value="${esc(data.storeName)}"></div>
            <div class="field span-2"><label>Address</label><textarea class="textarea" id="iAddress" rows="2">${esc(data.address)}</textarea></div>
            <div class="field span-2"><label>Phone numbers</label><div id="iPhones"></div><button class="btn btn-ghost" id="addPhone" type="button">${icon("plus")} Add another number</button><span class="hint">Mark each line for Voice calls, WhatsApp, or both.</span></div>
            <div class="field"><label>Primary language</label><select class="select" id="iLanguage">${LANGUAGE_OPTIONS.map(x=>`<option value="${x.id}" ${data.language===x.id?"selected":""}>${esc(x.native)} — ${esc(x.label)}</option>`).join("")}</select></div>
            <div class="field"><label>Currency</label><input class="input" id="iCurrency" maxlength="4" value="${esc(data.currency || "₹")}"></div>
          </div>
        </section>
        <section class="install-step" data-step="1"><h3>2. Super Admin</h3><p class="muted">This account owns the installation. Only Super Admin can open or edit system settings.</p>
          <div class="install-grid">
            <div class="field"><label>Full name</label><input class="input" id="iAdminName" value=""></div>
            <div class="field"><label>Username</label><input class="input" id="iAdminUser" value="admin" autocomplete="username"></div>
            <div class="field"><label>PIN</label><input class="input" id="iAdminPin" type="password" value="${esc(data.adminPin || "")}" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
            <div class="field"><label>Confirm PIN</label><input class="input" id="iAdminPin2" type="password" value="${esc(data.adminPin2 || "")}" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          </div>
        </section>
        <section class="install-step" data-step="2"><h3>3. Database &amp; Sync</h3><p class="muted">Choose how this installation stores its operational data.</p>
          <div class="install-choice">
            <label><input type="radio" name="iMode" value="hybrid" ${data.mode==="hybrid"?"checked":""}><div class="choice-card"><b>This PC + Google Sheets</b><p class="muted">Recommended. Fast local operation with central Sheets sync and offline support.</p></div></label>
            <label><input type="radio" name="iMode" value="sheets" ${data.mode==="sheets"?"checked":""}><div class="choice-card"><b>Google Sheets only</b><p class="muted">Central storage. Requires internet for normal operation.</p></div></label>
            <label><input type="radio" name="iMode" value="local" ${data.mode==="local"?"checked":""}><div class="choice-card"><b>This PC only</b><p class="muted">Standalone local database. No Google Sheets connection.</p></div></label>
          </div>
          <div class="field" id="iUrlWrap" style="margin-top:18px"><label>Google Apps Script Web App URL</label><input class="input" id="iUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(data.url)}"><span class="hint">Required for Google Sheets modes. This is entered once for this store backend, not on every counter.</span></div>
          <div class="field" style="margin-top:12px"><label>Optional API key</label><input class="input" id="iKey" type="password" value="${esc(data.key)}"><span class="hint">Use only if your Apps Script deployment has an API key configured.</span></div>
          <div class="field" id="iSetupCodeWrap" style="margin-top:12px"><label>One-time setup code</label><input class="input" id="iSetupCode" type="password" autocomplete="off" value="${esc(data.setupCode || "")}" placeholder="Code from getAuthSetupCode()"><span class="hint">Required for the first cloud installation. Generate it once in the Apps Script editor.</span></div>
        </section>
        <section class="install-step" data-step="3"><h3>4. Tax &amp; Payments</h3><p class="muted">Configure the tax identity and payment information used by billing and receipts.</p>
          <div class="install-grid">
            <div class="field"><label>Tax / GST / VAT ID</label><input class="input" id="iTaxId" value="${esc(data.taxId || "")}"></div>
            <div class="field"><label>Tax label</label><input class="input" id="iTaxLabel" value="${esc(data.taxLabel || "GST")}"></div>
            <div class="field span-2"><label>UPI ID</label><input class="input" id="iUpi" value="${esc(data.upiId || "")}" placeholder="store@bank"></div>
            <div class="field span-2"><label>Receipt footer</label><textarea class="textarea" id="iFooter" rows="2">${esc(data.receiptFooter || "")}</textarea></div>
          </div>
        </section>
        <section class="install-step" data-step="4"><h3>5. Branding &amp; Appearance</h3><p class="muted">Make the POS match your store. These choices can be changed later by Super Admin.</p>
          <div class="install-brand-grid">
            <div class="install-brand-main">
              <div class="field"><label>Brand colour</label><div class="swatches install-swatches" id="iSwatches"><button type="button" class="swatch" data-install-color="#0f9d58" title="Fresh green" style="--c:#0f9d58"></button><button type="button" class="swatch" data-install-color="#2563eb" title="Ocean blue" style="--c:#2563eb"></button><button type="button" class="swatch" data-install-color="#7c3aed" title="Royal purple" style="--c:#7c3aed"></button><button type="button" class="swatch" data-install-color="#db2777" title="Berry pink" style="--c:#db2777"></button><button type="button" class="swatch" data-install-color="#dc2626" title="Chilli red" style="--c:#dc2626"></button><button type="button" class="swatch" data-install-color="#ea580c" title="Saffron" style="--c:#ea580c"></button><button type="button" class="swatch" data-install-color="#0891b2" title="Teal" style="--c:#0891b2"></button><button type="button" class="swatch" data-install-color="#b45309" title="Masala brown" style="--c:#b45309"></button><button type="button" class="swatch" data-install-color="#1f2937" title="Charcoal" style="--c:#1f2937"></button></div>
                <div class="install-color-row"><input class="input" id="iColorHex" value="${esc(data.themeColor || "#0f9d58")}" maxlength="7"><input id="iColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(data.themeColor||"")?data.themeColor:"#0f9d58"}"></div>
                <span class="hint">Choose a preset or any custom colour.</span>
              </div>
              <div class="field"><label>Overall appearance</label><div class="segmented full install-segmented">
                <label class="seg"><input type="radio" name="iThemeMode" value="light" ${data.themeMode!=="dark"&&data.themeMode!=="system"?"checked":""}>Light</label>
                <label class="seg"><input type="radio" name="iThemeMode" value="dark" ${data.themeMode==="dark"?"checked":""}>Dark</label>
                <label class="seg"><input type="radio" name="iThemeMode" value="system" ${data.themeMode==="system"?"checked":""}>System</label>
              </div></div>
              <div class="field"><label>Side menu style</label><div class="segmented full install-segmented">
                <label class="seg"><input type="radio" name="iSidebarTheme" value="light" ${data.sidebarTheme!=="brand"&&data.sidebarTheme!=="dark"?"checked":""}>Light</label>
                <label class="seg"><input type="radio" name="iSidebarTheme" value="brand" ${data.sidebarTheme==="brand"?"checked":""}>Brand colour</label>
                <label class="seg"><input type="radio" name="iSidebarTheme" value="dark" ${data.sidebarTheme==="dark"?"checked":""}>Dark</label>
              </div></div>
            </div>
            <div class="install-brand-assets">
              <div class="field"><label>POS logo</label><input class="input" id="iLogo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="hint">Used in the POS sidebar. Max 3 MB.</span></div>
              <div class="field"><label>Invoice / receipt logo</label><input class="input" id="iReceiptLogo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="hint">Optional separate logo for printed/on-screen receipts.</span></div>
              <div class="field"><label>Favicon</label><input class="input" id="iFavicon" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="hint">Used for the browser tab and shortcut where supported.</span></div>
              <div class="field"><label>Product pictures</label><select class="select" id="iImages"><option value="emoji" ${data.productImageMode==="photo"?"":"selected"}>Emoji</option><option value="photo" ${data.productImageMode==="photo"?"selected":""}>Photos</option></select></div>
              <div class="field"><label>Product code labels</label><select class="select" id="iLabelCode"><option value="qr" ${data.productLabelCode==="barcode"?"":"selected"}>QR code</option><option value="barcode" ${data.productLabelCode==="barcode"?"selected":""}>Barcode</option></select></div>
            </div>
          </div>
        </section>
        <section class="install-step" data-step="5"><h3>6. Review &amp; Install</h3><p class="muted">The backend will be initialized only once. Existing installations cannot be overwritten from this wizard.</p><div id="iSummary" class="install-summary"></div></section>
        <section class="install-step" data-step="6"><div class="install-success"><div class="big">✓</div><h2>Installation Complete</h2><p class="muted">Your store is configured and the Super Admin account is ready.</p><div id="installAccessBox"></div><div class="card install-next-steps"><b>Recommended next steps</b><ol><li>Create staff accounts</li><li>Add products and opening inventory</li><li>Configure payment methods</li><li>Print and test a receipt</li></ol></div><button class="btn btn-primary" id="finishInstall">Go to Dashboard</button></div></section>
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

  const syncMode = () => {
    const mode = root.querySelector('input[name="iMode"]:checked')?.value || "hybrid";
    data.mode = mode; $("#iUrlWrap",root).style.display = mode === "local" ? "none" : ""; $("#iSetupCodeWrap",root).style.display = mode === "local" ? "none" : "";
  };
  root.querySelectorAll('input[name="iMode"]').forEach((r) => r.addEventListener("change", syncMode));
  syncMode();
  root.addEventListener("input", (e) => {
    if (e.target.id === "iAdminPin") data.adminPin = e.target.value;
    if (e.target.id === "iAdminPin2") data.adminPin2 = e.target.value;
  });

  const collect = () => {
    data.storeName = $("#iStore",root).value.trim(); data.address=$("#iAddress",root).value.trim();
    data.phoneNumbers=cleanPhoneRows(data.phoneNumbers);
    data.language=$("#iLanguage",root).value; data.currency=$("#iCurrency",root).value.trim()||"₹";
    data.adminName=$("#iAdminName",root).value.trim(); data.adminUsername=$("#iAdminUser",root).value.trim().toLowerCase();
    if ($("#iAdminName",root).value.trim()) data.adminName=$("#iAdminName",root).value.trim();
    if ($("#iAdminUser",root).value.trim()) data.adminUsername=$("#iAdminUser",root).value.trim().toLowerCase();
    if ($("#iAdminPin",root).value) data.adminPin=$("#iAdminPin",root).value;
    if ($("#iAdminPin2",root).value) data.adminPin2=$("#iAdminPin2",root).value;
    data.taxId=$("#iTaxId",root).value.trim(); data.taxLabel=$("#iTaxLabel",root).value.trim()||"GST";
    data.upiId=$("#iUpi",root).value.trim(); data.themeColor=/^#[0-9a-f]{6}$/i.test($("#iColorHex",root)?.value.trim()||"")?$("#iColorHex",root).value.trim():$("#iColor",root).value;
    data.themeMode=root.querySelector('input[name="iThemeMode"]:checked')?.value || "light";
    data.sidebarTheme=root.querySelector('input[name="iSidebarTheme"]:checked')?.value || "light";
    data.productLabelCode=$("#iLabelCode",root).value; data.productImageMode=$("#iImages",root).value; data.receiptFooter=$("#iFooter",root).value.trim();
    data.url=$("#iUrl",root).value.trim(); data.key=$("#iKey",root).value; data.setupCode=$("#iSetupCode",root)?.value.trim() || data.setupCode || "";
  };
  const validate = () => {
    collect();
    if (step===0 && !data.storeName) throw new Error("Store name is required.");
    if (step===1 && (!data.adminName || !data.adminUsername)) throw new Error("Super Admin name and username are required.");
    if (step===1 && !/^\d{4,12}$/.test(data.adminPin || "")) throw new Error("Super Admin PIN must contain 4–12 digits.");
    if (step===1 && data.adminPin !== (data.adminPin2 || $("#iAdminPin2",root).value)) throw new Error("PIN confirmation does not match.");
    if (step===2 && data.mode !== "local" && !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(data.url)) throw new Error("Enter a deployed Apps Script Web App URL ending in /exec.");
    if (step===2 && data.mode !== "local" && !data.setupCode) throw new Error("Enter the one-time setup code generated by getAuthSetupCode().");
    if (step===4 && !/^#[0-9a-f]{6}$/i.test(data.themeColor || "")) throw new Error("Choose a valid brand colour.");
    return true;
  };
  const renderStep = () => {
    const existingPin = root.querySelector("#iAdminPin");
    const existingPin2 = root.querySelector("#iAdminPin2");
    if (existingPin) data.adminPin = existingPin.value;
    if (existingPin2) data.adminPin2 = existingPin2.value;
    root.querySelectorAll(".install-step").forEach((x)=>x.classList.toggle("active",Number(x.dataset.step)===step));
    $("#installProgress",root).style.width = `${Math.min(100, ((step+1)/6)*100)}%`;
    $("#iBack",root).disabled=step===0 || busy || step>=6;
    $("#iNext",root).style.display=step>=6?"none":"";
    $("#iNext",root).textContent=step===5?"Install POS":"Next";
    if(step===5){
      const items=[["Store",data.storeName],["Language",LANGUAGE_OPTIONS.find(x=>x.id===data.language)?.label||data.language],["Database",data.mode==="hybrid"?"Sheets + Local":data.mode==="sheets"?"Sheets only":"Local only"],["Super Admin",data.adminName+" (@"+data.adminUsername+")"],["Phone lines",String(data.phoneNumbers.length)],["Tax",data.taxId||"Not configured"],["UPI",data.upiId||"Not configured"],["Brand colour",data.themeColor],["Appearance",data.themeMode||"light"],["POS logo",data.logoUrl?"Configured":"Default"],["Receipt logo",data.receiptLogoUrl?"Configured":"Default"],["Favicon",data.faviconUrl?"Configured":"Default"]];
      $("#iSummary",root).innerHTML=items.map(([a,b])=>`<div class="card"><div class="muted">${esc(a)}</div><b>${esc(b)}</b></div>`).join("");
      hydrateIcons($("#iSummary",root));
    }
  };
  const install = async () => {
    collect(); validate(); busy=true; $("#iNext",root).disabled=true; $("#iBack",root).disabled=true;
    try {
      if (!data.logoUrl && $("#iLogo",root)?.files?.[0]) data.logoUrl = await readLogo($("#iLogo",root).files[0], data.mode, "store-logo");
      if (!data.receiptLogoUrl && $("#iReceiptLogo",root)?.files?.[0]) data.receiptLogoUrl = await readLogo($("#iReceiptLogo",root).files[0], data.mode, "receipt-logo");
      if (!data.faviconUrl && $("#iFavicon",root)?.files?.[0]) data.faviconUrl = await readLogo($("#iFavicon",root).files[0], data.mode, "favicon");
      const settings = { storeName:data.storeName,address:data.address,phoneNumbers:JSON.stringify(data.phoneNumbers),language:data.language,currency:data.currency,taxId:data.taxId,taxLabel:data.taxLabel,upiId:data.upiId,upiQrUrl:data.upiQrUrl||"",themeColor:data.themeColor,themeMode:data.themeMode,sidebarTheme:data.sidebarTheme,productImageMode:data.productImageMode,productLabelCode:data.productLabelCode,logoUrl:data.logoUrl||"",faviconUrl:data.faviconUrl||"",receiptLogoUrl:data.receiptLogoUrl||"",receiptFooter:data.receiptFooter };
      if (data.mode !== "local") {
        saveConfig({ mode:data.mode, url:data.url, key:data.key });
        await backend.initialize({ setupCode:data.setupCode, installation:{ id:uid(), language:data.language, mode:data.mode }, settings, admin:{ id:data.adminId, name:data.adminName, username:data.adminUsername, phone:data.phoneNumbers[0]?.number||"", role:"admin", active:true, ...await makeVerifier(data.adminPin) } });
      } else {
        saveConfig({ mode:"local", url:"", key:"" });
        await backend.startFresh();
      }
      if (data.mode !== "local") {
        const { onlineLogin } = await import("./auth.js");
        await onlineLogin(data.adminUsername, data.adminPin);
      }
      await saveSettings(settings);
      await provisionInitialAdmin({ id:data.adminId, name:data.adminName, username:data.adminUsername, phone:data.phoneNumbers[0]?.number||"", pin:data.adminPin });
      setMarker({ mode:data.mode });
      step=6; renderStep();
      if (data.mode !== "local") {
        const token = encodeStoreConfig({ url:data.url, key:data.key, mode:data.mode });
        const link = location.href.split("?")[0] + "?store=" + token;
        localStorage.setItem("pos.store.link.v1", link);
        $("#installAccessBox",root).innerHTML = `<div class="card" style="margin:18px auto;max-width:700px;text-align:left"><b>Store access link</b><p class="muted">Use this private link on another counter/device to open this store without re-entering the Apps Script URL.</p><input class="input" id="installAccessLink" readonly value="${esc(link)}"><button class="btn btn-outline" id="copyInstallLink" style="margin-top:8px">Copy store link</button></div>`;
        $("#copyInstallLink",root).onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Store access link copied"); } catch { toast("Copy failed — select and copy the link", "warn"); } };
      }
      $("#installFooter",root).style.display="none";
    } catch (e) {
      toast(e.message||"Installation failed.","error");
    } finally { busy=false; $("#iNext",root).disabled=false; }
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
    // Capture the credential fields immediately before validation/navigation. This
    // keeps the PIN authoritative even when browser password-field behavior is unusual.
    const pin=$("#iAdminPin",root), pin2=$("#iAdminPin2",root);
    if(pin) data.adminPin=pin.value;
    if(pin2) data.adminPin2=pin2.value;
    validate();
    if(step<5){step++;renderStep();}else await install();
  }catch(e){toast(e.message,"error");}};
  $("#iBack",root).onclick=()=>{if(step>0){step--;renderStep();}};
  $("#finishInstall",root).onclick=()=>{
    // Persist the completion marker again at the final navigation boundary. This makes
    // the completion action idempotent even if the page is navigated/reloaded immediately.
    setMarker({ mode: getConfig().mode });
    root.replaceChildren();
    window.dispatchEvent(new CustomEvent("installation:complete"));
    window.dispatchEvent(new CustomEvent("settings:changed"));
    location.hash="#/dashboard";
  };
  renderStep();
  return true;
}
