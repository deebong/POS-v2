// Optional: keep a copy of all POS data in a normal folder on the PC (e.g. Documents\FreshMart POS),
// using the File System Access API (Chrome / Edge on Windows, macOS, Linux, ChromeOS).
//   FreshMart-POS-data.json           – always the latest copy (rewritten a few seconds after each change)
//   backups/FreshMart-POS-YYYY-MM-DD.json – one file per day, the last 14 are kept
// The file includes changes that haven't synced yet, so nothing is lost if browser data is cleared.
import { idb } from "./idb.js";

const HANDLE_KEY = "folder.handle";
const META_KEY = "folder.meta";
const MAIN_FILE = "FreshMart-POS-data.json";
const KEEP_DAYS = 14;

export const folderSupported = typeof window.showDirectoryPicker === "function";

let handle = null;
let meta = { lastWrite: null, lastError: null };
let timer = null;
let exporter = null;
let writing = null;

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
  if (handle && (await permission()) === "granted") schedule();
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
  const names = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "file" && /^FreshMart-POS-\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name);
  }
  names.sort();
  for (const old of names.slice(0, Math.max(0, names.length - KEEP_DAYS))) await dir.removeEntry(old);
}

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
      await writeFile(handle, MAIN_FILE, text);
      const dir = await handle.getDirectoryHandle("backups", { create: true });
      await writeFile(dir, `FreshMart-POS-${today()}.json`, text);
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
