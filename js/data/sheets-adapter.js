// Google Sheets backend: talks to the Apps Script web app in apps-script/Code.gs.
// Used directly by "Google Sheets live" mode and as the sync transport of the offline-first mode.
//
// The request is a "simple" CORS request (Content-Type: text/plain) so the browser never sends a
// preflight — Apps Script web apps don't answer OPTIONS. The response is JSON.

export function createSheetsAdapter({ url, key }) {
  async function call(action, payload = {}, { timeoutMs = 45000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...(key ? { key } : {}), ...payload }),
        redirect: "follow",
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Error(
        e && e.name === "AbortError"
          ? "Google Sheets took too long to respond. Try again."
          : "Couldn't reach Google Sheets. Check your connection and the Web App URL.",
      );
    } finally {
      clearTimeout(timer);
    }
    let data;
    try {
      data = JSON.parse(await res.text());
    } catch {
      throw new Error(
        "That URL didn't return POS data. Deploy the script as a Web app with “Who has access: Anyone” and use the URL that ends in /exec.",
      );
    }
    if (!data || !data.ok) throw new Error((data && data.error) || "Request failed");
    return data;
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
