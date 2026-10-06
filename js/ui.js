// UI helpers: icons, formatting, modals, toasts, printing.
import { state } from "./store.js";

const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  qr: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h2v2h-2z"/><path d="M21 15v2"/><path d="M15 21h2"/><path d="M21 21h-2v-2"/><path d="M12 3v6"/><path d="M12 12h.01M3 12h3M9 12h.01M15 12h6"/>',
  receipt: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2Z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  up: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  down: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'log-in': '<path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  plusCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  box: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
  tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><path d="M7 7h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2.01-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  sync: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  install: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><rect x="3" y="15" width="18" height="6" rx="2"/>',
  chevronsLeft: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  chevronsRight: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
  panelLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.56C22 6 17.5 2 12 2Z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0V7"/>',
};

export const icon = (name, cls = "") => `<span class="ic ${cls}">${`<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`}</span>`;

/** Replace <span data-icon="x"> placeholders inside a root. */
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const cls = el.getAttribute("data-icon-class") || "";
    el.outerHTML = icon(el.getAttribute("data-icon"), cls);
  });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- formatting ---------- */
/** Indian digit grouping (1,23,456.00) for ₹, international grouping otherwise. */
const numLocale = () => (state.settings.currency === "₹" ? "en-IN" : "en-US");

export function money(n, settings = state.settings) {
  const v = Number(n) || 0;
  const currency = settings?.currency || "$";
  const locale = currency === "₹" ? "en-IN" : "en-US";
  const s = Math.abs(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${currency}${s}`;
}
export function num(n, max = 3) {
  return Number(n || 0).toLocaleString(numLocale(), { maximumFractionDigits: max });
}
export const fmtQty = (n, unit) => `${num(n)}${unit ? " " + unit : ""}`;
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtDateTime = (iso) => `${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${fmtTime(iso)}`;
export const methodLabel = (m) => ({ cash: "Cash", card: "Card", upi: "UPI / QR" })[m] || m;
export const methodBadge = (m) => `<span class="badge plain ${{ cash: "badge-green", card: "badge-blue", upi: "badge-violet" }[m] || "badge-gray"}">${esc(methodLabel(m))}</span>`;

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* ---------- toast ---------- */
export function toast(message, type = "success") {
  const root = $("#toastRoot");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === "success" ? "check" : "alert")}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, type === "error" ? 4200 : 2600);
}

/** Toast with a button; stays until clicked or closed. */
export function toastAction(message, label, onClick) {
  const root = $("#toastRoot");
  const el = document.createElement("div");
  el.className = "toast toast-action";
  el.innerHTML = `${icon("refresh")}<span>${esc(message)}</span><button class="btn btn-sm btn-primary">${esc(label)}</button><button class="icon-btn" aria-label="Dismiss">${icon("x", "sm")}</button>`;
  const close = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  };
  el.querySelector(".btn").onclick = () => {
    close();
    onClick();
  };
  el.querySelector(".icon-btn").onclick = close;
  root.appendChild(el);
  return close;
}

/* ---------- modal ---------- */
const stack = [];

function setContent(el, content) {
  if (content instanceof Node) el.replaceChildren(content);
  else el.innerHTML = content || "";
}

export function openModal({ title, sub = "", body = "", footer = "", size = "md", flush = false, onClose } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal modal-${size}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div><h3>${esc(title)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
        <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="modal-body ${flush ? "flush" : ""}"></div>
      <div class="modal-foot"></div>
    </div>`;
  const bodyEl = $(".modal-body", backdrop);
  const footEl = $(".modal-foot", backdrop);
  setContent(bodyEl, body);
  setContent(footEl, footer);
  let closed = false;
  const modal = {
    el: backdrop,
    body: bodyEl,
    foot: footEl,
    $: (sel) => backdrop.querySelector(sel),
    close(result) {
      if (closed) return;
      closed = true;
      backdrop.remove();
      const i = stack.indexOf(modal);
      if (i >= 0) stack.splice(i, 1);
      if (onClose) onClose(result);
    },
  };
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) modal.close();
  });
  $("[data-close]", backdrop).addEventListener("click", () => modal.close());
  $("#modalRoot").appendChild(backdrop);
  stack.push(modal);
  return modal;
}

export const topModal = () => stack[stack.length - 1] || null;
export const closeAllModals = () => [...stack].forEach((m) => m.close());

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) {
    e.preventDefault();
    stack[stack.length - 1].close();
  }
});

export function confirmDialog({ title = "Are you sure?", message = "", confirmText = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      size: "sm",
      body: `<p style="color:var(--text-2)">${esc(message)}</p>`,
      footer: `<button class="btn btn-outline" data-no>Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${esc(confirmText)}</button>`,
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
    m.$("[data-no]").onclick = () => m.close();
    m.$("[data-yes]").onclick = () => {
      answered = true;
      resolve(true);
      m.close();
    };
    m.$("[data-yes]").focus();
  });
}

/** Resolves with the chosen value (or null if dismissed). choices: [{ value, label, sub, primary }] */
export function choiceDialog({ title, message = "", choices = [] }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      size: "sm",
      body: `${message ? `<p style="color:var(--text-2);margin-bottom:14px">${esc(message)}</p>` : ""}<div class="choice-list">${choices
        .map(
          (c, i) => `<button class="choice ${c.primary ? "primary" : ""}" data-i="${i}"><b>${esc(c.label)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ""}</button>`,
        )
        .join("")}</div>`,
      onClose: () => {
        if (!answered) resolve(null);
      },
    });
    m.body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      answered = true;
      resolve(choices[Number(b.dataset.i)].value);
      m.close();
    });
  });
}

export function fmtBytes(n) {
  if (!n) return "0 MB";
  const mb = n / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ---------- print ---------- */
export async function printHtml(html) {
  const area = $("#printArea");
  area.innerHTML = html;
  const imgs = $$("img", area);
  await Promise.all(
    imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))),
  );
  document.body.classList.add("printing");
  const done = () => {
    document.body.classList.remove("printing");
    area.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 60);
}

export function downloadFile(filename, content, type = "text/csv") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 1040;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.09);
    setTimeout(() => ctx.close(), 300);
  } catch {
    /* audio unavailable */
  }
}
