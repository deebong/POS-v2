// Route bridge: procurement is a standalone module so the existing hash router does not need to be edited.
const procurementRoute = () => location.hash.replace(/^#\/?/, "").split("?")[0];
let procurementLoaded = false;
function ensureProcurementStyles() {
  if (document.querySelector('link[data-procurement-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/procurement.css";
  link.dataset.procurementCss = "1";
  document.head.appendChild(link);
}
async function loadProcurement(e) {
  if (procurementRoute() !== "procurement") return;
  if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
  ensureProcurementStyles();
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === "procurement"));
  const title = document.getElementById("pageTitle"); if (title) title.textContent = "Suppliers & Purchases";
  const sub = document.getElementById("pageSub"); if (sub) sub.textContent = "Supplier directory, purchases & incoming stock";
  document.title = `Suppliers & Purchases · ${document.getElementById("brandName")?.textContent || "FreshMart"}`;
  const mod = await import("./procurement.js");
  if (!procurementLoaded) procurementLoaded = true;

  // The procurement module currently performs its cloud bootstrap before rendering.
  // If a local IndexedDB snapshot exists, satisfy that first bootstrap from the cache so
  // the page paints immediately; a second invocation then refreshes the data from Sheets.
  let usedCacheBootstrap = false;
  try {
    const { idb } = await import("./data/idb.js");
    const cached = await idb.get("procurement.v1").catch(() => null);
    if (cached && !cached.outbox?.length && navigator.onLine) {
      const originalFetch = window.fetch.bind(window);
      let restored = false;
      const restore = () => { if (!restored) { restored = true; window.fetch = originalFetch; } };
      window.fetch = async (input, init = {}) => {
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
          if (body?.action === "procurementBootstrap") {
            restore();
            usedCacheBootstrap = true;
            return new Response(JSON.stringify({
              ok: true,
              suppliers: cached.suppliers || [],
              purchases: cached.purchases || [],
              purchaseItems: cached.purchaseItems || []
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
        } catch (_) {}
        return originalFetch(input, init);
      };
      try { await mod.enterProcurement(); } finally { restore(); }
      if (usedCacheBootstrap) {
        // Refresh from Google Sheets without blocking the already-rendered cached page.
        void mod.enterProcurement().catch((err) => console.warn("Procurement background refresh failed", err));
        return;
      }
    }
  } catch (_) {
    // Fall through to the normal module bootstrap if IndexedDB/cache interception is unavailable.
  }
  await mod.enterProcurement();
}
window.addEventListener("hashchange", loadProcurement, true);
if (procurementRoute() === "procurement") loadProcurement();
