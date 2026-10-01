// Legacy compatibility bridge for store navigation that predates the main hash router.
// Returns, Cash Drawer and End-of-Day Closing are injected here so the shell remains compatible with older cached index.html files.
(function ensureStoreNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const settings = nav.querySelector('[data-route="settings"]');

  if (!nav.querySelector('[data-route="returns"]')) {
    const a = document.createElement("a");
    a.href = "#/returns";
    a.dataset.route = "returns";
    a.title = "Returns & Exchanges";
    a.innerHTML = '<span data-icon="undo"></span><span class="txt">Returns</span>';
    if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
  }

  if (!nav.querySelector('[data-route="cashDrawer"]')) {
    const a = document.createElement("a");
    a.href = "#/cashDrawer";
    a.dataset.route = "cashDrawer";
    a.title = "Cash Drawer";
    a.innerHTML = '<span data-icon="cash"></span><span class="txt">Cash Drawer</span>';
    if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
  }

  if (!nav.querySelector('[data-route="closing"]')) {
    const a = document.createElement("a");
    a.href = "#/closing";
    a.dataset.route = "closing";
    a.title = "End-of-Day Closing";
    // Use an icon that is guaranteed to exist in the shared icon registry.
    // The previous calculator icon was not registered, leaving this nav item visually blank.
    a.innerHTML = '<span data-icon="receipt"></span><span class="txt">Day Close</span>';
    if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
  }

  if (!document.querySelector('link[data-cash-drawer-css="1"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/cash-drawer.css";
    link.dataset.cashDrawerCss = "1";
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-eod-closing-css="1"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/eod-closing.css";
    link.dataset.eodClosingCss = "1";
    document.head.appendChild(link);
  }
})();
