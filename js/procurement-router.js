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
            return new Response(JSON.stringify({ ok: true, suppliers: cached.suppliers || [], purchases: cached.purchases || [], purchaseItems: cached.purchaseItems || [] }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
        } catch (_) {}
        return originalFetch(input, init);
      };
      try { await mod.enterProcurement(); } finally { restore(); }
      if (usedCacheBootstrap) { void mod.enterProcurement().catch((err) => console.warn("Procurement background refresh failed", err)); return; }
    }
  } catch (_) {}
  await mod.enterProcurement();
}
window.addEventListener("hashchange", loadProcurement, true);
if (procurementRoute() === "procurement") loadProcurement();

// Returns & Exchanges uses the main module router, but its navigation entry is injected here so the
// existing shell can remain stable and all Store modules share the same sidebar.
(function ensureReturnsNav() {
  const nav = document.getElementById("nav");
  if (!nav || nav.querySelector('[data-route="returns"]')) return;
  const settings = nav.querySelector('[data-route="settings"]');
  const a = document.createElement("a");
  a.href = "#/returns";
  a.dataset.route = "returns";
  a.title = "Returns & Exchanges";
  a.innerHTML = '<span data-icon="undo"></span><span class="txt">Returns</span>';
  if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
})();
