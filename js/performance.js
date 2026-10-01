// Lightweight performance + shared UX normalization for the static POS shell.
// Operational data stays in IndexedDB/localStorage; cookies are intentionally not used for data caching.
(() => {
  const warmProcurement = () => {
    if (location.hash.replace(/^#\/?/, "").split("?")[0] === "procurement") return;
    import("./procurement.js").catch(() => {});
  };

  const conciseSubtitles = {
    inventory: "Stock, prices & product codes.",
    labels: "Print product labels with QR codes or barcodes.",
    sales: "Sales history & receipts.",
    customers: "Customer directory & purchase history.",
    settings: "Data, sync, offline & store profile.",
    procurement: "Suppliers, purchases & incoming stock.",
  };

  const routeName = () => location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";

  function applySharedPageLayout() {
    const route = routeName();
    const storePage = route !== "dashboard" && route !== "pos";
    document.documentElement.classList.toggle("store-page", storePage);
    if (!storePage) return;

    // The bold page title belongs in the global topbar. The compact description belongs
    // in the content area, alongside that page's actions.
    const pageHead = document.querySelector("#view .page-head");
    if (pageHead) {
      const title = pageHead.querySelector("h2");
      const sub = pageHead.querySelector("p");
      if (title) title.style.display = "none";
      if (sub) sub.textContent = conciseSubtitles[route] || sub.textContent;
    }

    const procHead = document.querySelector("#view .proc-head");
    if (procHead) {
      const title = procHead.querySelector("h2");
      const sub = procHead.querySelector("p");
      if (title) title.style.display = "none";
      if (sub) sub.textContent = conciseSubtitles.procurement;
    }
  }

  function injectSharedUxCss() {
    if (document.getElementById("freshmart-shared-ux-fixes")) return;
    const style = document.createElement("style");
    style.id = "freshmart-shared-ux-fixes";
    style.textContent = `
      /* Store pages: global title is centered; their compact description lives in the content header. */
      .store-page .topbar .title-wrap { display:flex; align-items:center; min-width:0; }
      .store-page .topbar .title-wrap .sub { display:none !important; }
      .store-page .topbar h1 { line-height:1.15; }

      /* Consistent Store-page content header: compact description left, actions right. */
      .store-page .page-head { align-items:center !important; flex-wrap:nowrap; }
      .store-page .page-head > div:first-child { min-width:0; flex:1 1 auto; }
      .store-page .page-head > div:first-child p { margin:0 !important; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .store-page .page-head .actions { flex:0 0 auto; margin-left:auto; }

      /* Procurement uses its own header class but follows exactly the same geometry. */
      .store-page .proc-head { display:flex; align-items:center; gap:16px; flex-wrap:nowrap; }
      .store-page .proc-head > div:first-child { min-width:0; flex:1 1 auto; }
      .store-page .proc-head > div:first-child p { margin:0 !important; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .store-page .proc-head .btn-row { flex:0 0 auto; }

      /* Supplier form textareas: fixed field height + symmetric vertical padding keeps one-line
         values visually centered while still allowing two-line content when needed. */
      .modal textarea[name="address"],
      .modal textarea[name="notes"] {
        height:54px !important;
        min-height:54px !important;
        padding:14px 14px !important;
        line-height:24px !important;
        resize:vertical;
      }

      /* POS product cards: restore a generous image band and keep the product name below it. */
      .pcard { min-height:174px; gap:9px; }
      .pcard .pic { height:78px !important; min-height:78px; flex:0 0 78px; }
      .pcard .nm { margin-top:1px; min-height:36px; }

      @media (max-width:900px) {
        .store-page .page-head, .store-page .proc-head { align-items:flex-start !important; flex-wrap:wrap; }
        .store-page .page-head > div:first-child, .store-page .proc-head > div:first-child { flex-basis:100%; }
        .store-page .page-head > div:first-child p, .store-page .proc-head > div:first-child p { white-space:normal; }
        .store-page .page-head .actions, .store-page .proc-head .btn-row { margin-left:auto; }
      }
    `;
    document.head.appendChild(style);
  }

  injectSharedUxCss();

  // Apply after each route/module paints its DOM. A few animation frames are enough for
  // dynamically imported modules without keeping a permanent MutationObserver running.
  const applyWhenReady = () => {
    applySharedPageLayout();
    if (routeName() === "dashboard" || routeName() === "pos") return;
    let frames = 0;
    const tick = () => {
      applySharedPageLayout();
      if (++frames < 4) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  window.addEventListener("hashchange", applyWhenReady);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyWhenReady, { once:true });
  else applyWhenReady();

  // Procurement is the only Store module loaded dynamically. Warm its code during idle time
  // so opening Purchases does not pay the module-download/parse cost on the critical click path.
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warmProcurement, { timeout: 1500 });
  } else {
    setTimeout(warmProcurement, 800);
  }

  window.addEventListener("hashchange", () => {
    if (routeName() === "procurement") warmProcurement();
  });
})();
