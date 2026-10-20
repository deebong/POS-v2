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
          body: JSON.stringify({ action, ...(key ? { key } : {}), ...((localStorage.getItem("freshmart.auth.token") || sessionStorage.getItem("freshmart.auth.token")) ? { authToken: (localStorage.getItem("freshmart.auth.token") || sessionStorage.getItem("freshmart.auth.token")) } : {}), ...payload }),
          redirect: "follow",
          cache: "no-store",
          signal: ctrl.signal,
        });

        const responseText = await res.text();
        let data = null;
        try {
          data = JSON.parse(responseText);
        } catch {
          lastError = new Error(res.status === 404
            ? "Google Sheets returned a non-JSON response (HTTP 404). The saved Apps Script URL does not resolve to a deployed Web App. Open Settings > Data storage & sync, test the connection, and replace the URL with the current deployed Web App URL ending in /exec."
            : `Google Sheets returned a non-JSON response (HTTP ${res.status}). The Apps Script Web App may be unavailable or the deployment URL may be outdated.`);
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            continue;
          }
          throw lastError;
        }

        if (!res.ok) throw new Error((data && data.error) || `Google Sheets returned HTTP ${res.status}`);
        if (!data || !data.ok) {
          const message = (data && data.error) || "Request failed";
          if (/Authentication required or session expired|Sign in again/i.test(message) &&
              !/^(authChallenge|authLogin|authLogout|authStatus|saveSettings|uploadImage|syncBatch)$/.test(action)) {
            localStorage.removeItem("freshmart.auth.token");
            sessionStorage.removeItem("freshmart.auth.token");
            if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("auth:expired", { detail: { action, message } }));
          }
          throw new Error(message);
        }
        return data;
      } catch (e) {
        lastError = e;
        if (e && e.name === "AbortError") {
          throw new Error(`Google Sheets took too long to respond (${Math.round(timeoutMs / 1000)}s). Check the Apps Script Web App deployment.`);
        }
        const errorText = String(e && e.message);
        const retryable = !/HTTP 404/.test(errorText) && /non-JSON response|Couldn't reach Google Sheets|Failed to fetch|NetworkError|Load failed/i.test(errorText);
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
    ping: () => call("ping", {}, { timeoutMs: 20000, retries: 1 }),
    authChallenge: (arg) => call("authChallenge", arg, { timeoutMs: 25000, retries: 1 }),
    authLogin: (arg) => call("authLogin", arg, { timeoutMs: 25000, retries: 1 }),
    authLogout: (payload = {}) => call("authLogout", payload, { timeoutMs: 15000, retries: 0 }),
    // Staff provisioning is background work. Apps Script can be cold or briefly busy;
    // give it a real retry window instead of surfacing an 8–15s timeout to the operator.
    authSyncStaff: (arg) => call("authSyncStaff", arg, { timeoutMs: 45000, retries: 2 }),
    authStatus: () => call("authStatus", {}, { timeoutMs: 20000, retries: 1 }),
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