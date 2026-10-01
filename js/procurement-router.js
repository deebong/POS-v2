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
  await mod.enterProcurement();
}
window.addEventListener("hashchange", loadProcurement, true);
if (procurementRoute() === "procurement") loadProcurement();
