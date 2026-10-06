// Google Drive disaster-recovery backup controls exposed by the Apps Script backend.
import { getConfig } from "./backend.js";
import { createSheetsAdapter } from "./sheets-adapter.js";

export async function cloudBackup(action, payload = {}) {
  const cfg = getConfig();
  if (!cfg.url) throw new Error("Connect Google Sheets before using Google Drive backups.");
  const adapter = createSheetsAdapter(cfg);
  if (typeof adapter[action] !== "function") throw new Error("This Apps Script version does not support backup controls yet.");
  return adapter[action](payload);
}
