// Lightweight performance helpers for the static POS shell.
// The POS keeps operational data in IndexedDB/localStorage; cookies are intentionally not used for data caching.
(() => {
  const warmProcurement = () => {
    if (location.hash.replace(/^#\/?/, "").split("?")[0] === "procurement") return;
    import("./procurement.js").catch(() => {});
  };

  // The procurement module is the only Store module loaded dynamically. Warm its code during idle time
  // so opening Purchases does not pay the module-download/parse cost on the critical click path.
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warmProcurement, { timeout: 1500 });
  } else {
    setTimeout(warmProcurement, 800);
  }

  // Keep route changes paint-first: do not force a network request merely because the user navigated.
  // Existing IndexedDB snapshots are the first source of truth; background sync handles freshness.
  window.addEventListener("hashchange", () => {
    if (location.hash.replace(/^#\/?/, "").split("?")[0] === "procurement") warmProcurement();
  });
})();
