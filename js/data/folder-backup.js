// Optional: keep a copy of all POS data in a normal folder on the PC (e.g. Documents\FreshMart POS),
// using the File System Access API (Chrome / Edge on Windows, macOS, Linux, ChromeOS).
//   FreshMart-POS-data.json           – always the latest copy (rewritten a few seconds after each change)
//   backups/FreshMart-POS-YYYY-MM-DD.json – one file per day, the last 14 are kept
// The file includes changes that haven't synced yet, so nothing is lost if browser data is cleared.
import { idb } from "./idb.js";

const HANDLE_KEY = "folder.handle";
const META_KEY = "folder.meta";
const MAIN_FILE = "FreshMart-POS-data.json";
const KEEP_DAYS = 30;
const KEEP_WEEKS = 12;
const KEEP_MONTHS = 12;
const MANIFEST_FILE = "FreshMart-POS-manifest.json";

export const folderSupported = typeof window.showDirectoryPicker === "function";

let handle = null;
let meta = { lastWrite: null, lastError: null };
let timer = null;
let exporter = null;
let writing = null;
let autoDay = "";

const emit = () => window.dispatchEvent(new CustomEvent("backup:status"));
const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function permission() {
  if (!handle) return "none";
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "prompt";
  }
}

export async function initFolderBackup(exportFn) {
  exporter = exportFn;
  handle = (await idb.get(HANDLE_KEY).catch(() => null)) || null;
  meta = { ...meta, ...((await idb.get(META_KEY).catch(() => null)) || {}) };
  window.addEventListener("pos:local-change", schedule);
  if (handle && (await permission()) === "granted") {
    schedule();
    const d = today();
    if (autoDay !== d) { autoDay = d; writeNow().catch(() => {}); }
  }
  if (!window.__freshmartBackupTimer) {
    window.__freshmartBackupTimer = setInterval(() => {
      if (!handle) return;
      const d = today();
      if (d !== autoDay) { autoDay = d; writeNow().catch(() => {}); }
    }, 30 * 60 * 1000);
  }
  emit();
}

export async function folderState() {
  if (!handle) return { connected: false, supported: folderSupported };
  return { connected: true, supported: folderSupported, name: handle.name, permission: await permission(), ...meta };
}

export async function chooseFolder() {
  const h = await window.showDirectoryPicker({ id: "freshmart-pos", mode: "readwrite", startIn: "documents" });
  handle = h;
  await idb.set(HANDLE_KEY, h);
  await writeNow();
  return h.name;
}

/** Browsers ask again for access after a restart; this must be called from a click. */
export async function reconnectFolder() {
  if (!handle) return false;
  const p = await handle.requestPermission({ mode: "readwrite" });
  if (p === "granted") await writeNow();
  emit();
  return p === "granted";
}

export async function forgetFolder() {
  handle = null;
  meta = { lastWrite: null, lastError: null };
  await idb.del(HANDLE_KEY);
  await idb.set(META_KEY, meta);
  emit();
}

function schedule() {
  if (!handle) return;
  clearTimeout(timer);
  timer = setTimeout(() => writeNow().catch(() => {}), 4000);
}

async function writeFile(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function prune(dir) {
  const groups = [
    { dir: "daily", re: /^FreshMart-POS-\d{4}-\d{2}-\d{2}\.json$/, keep: KEEP_DAYS },
    { dir: "weekly", re: /^FreshMart-POS-W-\d{4}-\d{2}-\d{2}\.json$/, keep: KEEP_WEEKS },
    { dir: "monthly", re: /^FreshMart-POS-M-\d{4}-\d{2}\.json$/, keep: KEEP_MONTHS },
  ];
  for (const group of groups) {
    const sub = await dir.getDirectoryHandle(group.dir, { create: true });
    const names = [];
    for await (const [name, h] of sub.entries()) if (h.kind === "file" && group.re.test(name)) names.push(name);
    names.sort();
    for (const old of names.slice(0, Math.max(0, names.length - group.keep))) await sub.removeEntry(old);
  }
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dateParts() {
  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return { d, day: today(), month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, monday };
}

async function readFileText(dir, name) { const fh = await dir.getFileHandle(name); return (await fh.getFile()).text(); }
async function writeManifest(dir, manifest) { await writeFile(dir, MANIFEST_FILE, JSON.stringify(manifest, null, 2)); }

export async function writeNow() {
  if (!handle || !exporter) return false;
  if (writing) return writing;
  writing = (async () => {
    try {
      if ((await permission()) !== "granted") {
        meta.lastError = "Access to the folder needs to be allowed again — click Reconnect.";
        return false;
      }
      const data = await exporter();
      if (!data) return false;
      const text = JSON.stringify(data);
      const parts = dateParts();
      const checksum = await sha256Hex(text);
      await writeFile(handle, MAIN_FILE, text);
      const dir = await handle.getDirectoryHandle("backups", { create: true });
      const daily = await dir.getDirectoryHandle("daily", { create: true });
      await writeFile(daily, `FreshMart-POS-${parts.day}.json`, text);
      if (parts.d.getDay() === 1) {
        const weekly = await dir.getDirectoryHandle("weekly", { create: true });
        await writeFile(weekly, `FreshMart-POS-W-${parts.day}.json`, text);
      }
      if (parts.d.getDate() === 1) {
        const monthly = await dir.getDirectoryHandle("monthly", { create: true });
        await writeFile(monthly, `FreshMart-POS-M-${parts.month}.json`, text);
      }
      await writeManifest(handle, { app: "freshmart-pos", format: 2, generatedAt: new Date().toISOString(), bytes: text.length, sha256: checksum, dailyRetention: KEEP_DAYS, weeklyRetention: KEEP_WEEKS, monthlyRetention: KEEP_MONTHS });
      await prune(dir);
      meta.lastWrite = new Date().toISOString();
      meta.lastError = null;
      return true;
    } catch (e) {
      meta.lastError = e.message || "Couldn't write the backup file";
      return false;
    } finally {
      await idb.set(META_KEY, meta).catch(() => {});
      writing = null;
      emit();
    }
  })();
  return writing;
}


export async function verifyFolderBackup() {
  if (!handle || !exporter) return { ok: false, status: "not-connected", message: "No backup folder is connected." };
  if ((await permission()) !== "granted") return { ok: false, status: "permission", message: "Reconnect the backup folder first." };
  try {
    const text = await readFileText(handle, MAIN_FILE);
    const manifest = JSON.parse(await readFileText(handle, MANIFEST_FILE));
    const checksum = await sha256Hex(text);
    const data = JSON.parse(text);
    const validApp = data?.app === "freshmart-pos";
    const checksumOk = checksum === manifest.sha256;
    const sizeOk = Number(manifest.bytes) === text.length;
    return {
      ok: validApp && checksumOk && sizeOk,
      status: validApp && checksumOk && sizeOk ? "verified" : "failed",
      message: validApp && checksumOk && sizeOk ? "Backup file is readable and its checksum matches the manifest." : "Backup validation failed: the file, manifest or checksum does not match.",
      generatedAt: manifest.generatedAt || null,
      checksum,
      bytes: text.length,
      products: Array.isArray(data.local?.products) ? data.local.products.length : Array.isArray(data.hybrid?.snapshot?.products) ? data.hybrid.snapshot.products.length : null,
      sales: Array.isArray(data.local?.sales) ? data.local.sales.length : Array.isArray(data.hybrid?.snapshot?.sales) ? data.hybrid.snapshot.sales.length : null,
    };
  } catch (e) {
    return { ok: false, status: "failed", message: e.message || "Backup verification failed." };
  }
}
