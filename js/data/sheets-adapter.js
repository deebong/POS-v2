// Google Sheets backend: talks to the Apps Script web app in apps-script/Code.gs.
// Used directly by "Google Sheets live" mode and as the sync transport of the offline-first mode.
//
// The request is a "simple" CORS request (Content-Type: text/plain) so the browser never sends a
// preflight — Apps Script web apps don't answer OPTIONS. The response is JSON.

export function createSheetsAdapter({ url, key }) {
  async function call(action, payload = {}, { timeoutMs = 45000 } = {}) {
    let lastError = null;

    // Apps Script ContentService responses are redirected to a googleusercontent.com URL.
    // A short retry helps with transient cold-start/redirect failures without making normal
    // requests noticeably slower.
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8", Accept: "application/json,text/plain,*/*" },
          body: JSON.stringify({ action, ...(key ? { key } : {}), ...payload }),
          redirect: "follow",
          cache: "no-store",
          signal: ctrl.signal,
        });

        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          lastError = new Error(
            `Google Sheets returned a non-JSON response (HTTP ${res.status}). The Apps Script Web App may be unavailable or the deployment URL may be outdated.`,
          );
          if (attempt === 0) {
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
          throw new Error("Google Sheets took too long to respond. Try again.");
        }
        // Retry only transport/non-JSON failures. Do not repeat a valid Apps Script error
        // such as an invalid action or access key.
        const retryable = /non-JSON response|Couldn't reach Google Sheets|Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message));
        if (attempt === 0 && retryable) {
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
    ping: () => call("ping"),
    bootstrap: (opts) => call("bootstrap", opts || {}),
    saveProduct: (arg) => call("saveProduct", arg),
    deleteProduct: (arg) => call("deleteProduct", arg),
    adjustStock: (arg) => call("adjustStock", arg),
    importProducts: (arg) => call("importProducts", arg, { timeoutMs: 120000 }),
    checkout: (arg) => call("checkout", arg),
    voidSale: (arg) => call("voidSale", arg),
    getSale: (arg) => call("getSale", arg),
    saveSettings: (arg) => call("saveSettings", arg),
    syncBatch: (arg) => call("syncBatch", arg, { timeoutMs: 180000 }),
    importBulk: (arg) => call("importBulk", arg, { timeoutMs: 280000 }),
    uploadImage: (arg) => call("uploadImage", arg, { timeoutMs: 120000 }),
    status: () => ({ mode: "sheets", online: navigator.onLine, pending: 0 }),
    exportData: async () => null, // data lives in the sheet in this mode
  };
}
