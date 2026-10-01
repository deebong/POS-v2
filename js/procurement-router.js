// Legacy compatibility bridge for store navigation that predates the main hash router.
// Store modules are injected here so the shell remains compatible with older cached index.html files.
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
    a.innerHTML = '<span data-icon="receipt"></span><span class="txt">Day Close</span>';
    if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
  }

  if (!nav.querySelector('[data-route="audit"]')) {
    const a = document.createElement("a");
    a.href = "#/audit";
    a.dataset.route = "audit";
    a.title = "Audit Log";
    a.innerHTML = '<span data-icon="list"></span><span class="txt">Audit Log</span>';
    if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
  }

  if (!nav.querySelector('[data-route="lowStock"]')) {
    const a = document.createElement("a");
    a.href = "#/lowStock";
    a.dataset.route = "lowStock";
    a.title = "Low Stock";
    a.innerHTML = '<span data-icon="alert"></span><span class="txt">Low Stock</span>';
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
  if (!document.querySelector('link[data-audit-log-css="1"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/audit-log.css";
    link.dataset.auditLogCss = "1";
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-low-stock-css="1"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/low-stock.css";
    link.dataset.lowStockCss = "1";
    document.head.appendChild(link);
  }

  // openModal binds the header X to [data-close], but older modal footers can contain
  // additional [data-close] buttons. Delegate those buttons globally so Cancel always works.
  if (!window.__freshmartModalCloseFix) {
    window.__freshmartModalCloseFix = true;
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-close]");
      if (!button) return;
      const modal = button.closest(".modal-backdrop");
      if (!modal) return;
      // The modal's native handler may already have closed it. Escape safely no-ops in that case.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: false }));
    });
  }
})();
