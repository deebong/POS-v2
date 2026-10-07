// Google Sheets backend: talks to the Apps Script web app in apps-script/Code.gs.
// Used directly by "Google Sheets live" mode and as the sync transport of the offline-first mode.
//
// The request is a "simple" CORS request (Content-Type: text/plain) so the browser never sends a
// preflight — Apps Script web apps don't answer OPTIONS. The response is JSON.

export function createSheetsAdapter({ url, key }) {
  async function call(action, payload = {}, { timeoutMs = 45000, retries = 1 } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8", Accept: "application/json,text/plain,*/*" },
          body: JSON.stringify({ action, ...(key ? { key } : {}), ...(sessionStorage.getItem("freshmart.auth.token") ? { authToken: sessionStorage.getItem("freshmart.auth.token") } : {}), ...payload }),
          redirect: "follow",
          cache: "no-store",
          signal: ctrl.signal,
        });

        const responseText = await res.text();
        let data = null;
        try {
          data = JSON.parse(responseText);
        } catch {
          lastError = new Error(
            `Google Sheets returned a non-JSON response (HTTP ${res.status}). The Apps Script Web App may be unavailable or the deployment URL may be outdated.`,
          );
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            continue;
          }
          throw lastError;
        }

        if (!res.ok) throw new Error((data && data.error) || `Google Sheets returned HTTP ${res.status}`);
        if (!data || !data.ok) throw new Error((data && data.error) || "Request failed");
        return data;
      } catch (e) {
        lastError = e;
        if (e && e.name === "AbortError") {
          throw new Error(`Google Sheets took too long to respond (${Math.round(timeoutMs / 1000)}s). Check the Apps Script Web App deployment.`);
        }
        const retryable = /non-JSON response|Couldn't reach Google Sheets|Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message));
        if (attempt < retries && retryable) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          continue;
        }
        throw e && e.message ? e : new Error("Couldn't reach Google Sheets. Check your connection and the Web App URL.");
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error("Couldn't reach Google Sheets. Check your connection and the Web App URL.");
  }

  return {
    kind: "sheets",
    // Connectivity/auth probes must fail fast. They must never make the operator wait through
    // two 45-second attempts when the Apps Script deployment is stale or unavailable.
    ping: () => call("ping", {}, { timeoutMs: 8000, retries: 0 }),
    authChallenge: (arg) => call("authChallenge", arg, { timeoutMs: 12000, retries: 0 }),
    authLogin: (arg) => call("authLogin", arg, { timeoutMs: 12000, retries: 0 }),
    authLogout: () => call("authLogout", {}, { timeoutMs: 8000, retries: 0 }),
    authSyncStaff: (arg) => call("authSyncStaff", arg, { timeoutMs: 15000, retries: 0 }),
    authStatus: () => call("authStatus", {}, { timeoutMs: 8000, retries: 0 }),
    installationStatus: () => call("installationStatus", {}, { timeoutMs: 12000, retries: 0 }),
    initialize: (arg) => call("initialize", arg, { timeoutMs: 120000, retries: 0 }),
    authDevices: () => call("authDevices", {}, { timeoutMs: 12000, retries: 0 }),
    authRevokeDevice: (arg) => call("authRevokeDevice", arg, { timeoutMs: 12000, retries: 0 }),
    bootstrap: (opts) => call("bootstrap", opts || {}),
    saveProduct: (arg) => call("saveProduct", arg),
    deleteProduct: (arg) => call("deleteProduct", arg),
    adjustStock: (arg) => call("adjustStock", arg),
    importProducts: (arg) => call("importProducts", arg, { timeoutMs: 120000 }),
    checkout: (arg) => call("checkout", arg),
    voidSale: (arg) => call("voidSale", arg),
    getSale: (arg) => call("getSale", arg),
    saveCustomer: (arg) => call("saveCustomer", arg),
    saveSettings: (arg) => call("saveSettings", arg),
    syncBatch: (arg) => call("syncBatch", arg, { timeoutMs: 180000 }),
    importBulk: (arg) => call("importBulk", arg, { timeoutMs: 280000 }),
    uploadImage: (arg) => call("uploadImage", arg, { timeoutMs: 120000 }),
    backupStatus: () => call("backupStatus"),
    backupSetup: (arg) => call("backupSetup", arg),
    backupNow: (arg) => call("backupNow", arg, { timeoutMs: 180000 }),
    backupVerify: () => call("backupVerify"),
    backupRestore: (arg) => call("backupRestore", arg, { timeoutMs: 180000 }),
    auditAppend: (arg) => call("auditAppend", arg),
    status: () => ({ mode: "sheets", online: navigator.onLine, pending: 0 }),
    exportData: async () => null,
  };
}