// Legacy compatibility bridge. Procurement is now owned by the main hash router.
// Keep only the Returns navigation injection here so existing shell markup remains unchanged.
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
