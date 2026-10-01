// Cross-module UX standards shared by the static POS shell.
// Keeps every Store page aligned with the established shell instead of duplicating page titles.
(() => {
  const STYLE_ID = "ux-standards-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Global header: the bold page title stays in the shell and is vertically centered. */
      .topbar .title-wrap {
        align-self: stretch;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
      }
      .topbar h1 { line-height: 1.12; }
      .topbar .sub { line-height: 1.25; }

      /* Store pages: keep only the bold title in the global header and move the descriptive
         subtitle into the body area where the old duplicated heading used to occupy space.
         Dashboard and POS deliberately keep their existing header treatment. */
      body:has(#nav a[data-route="inventory"].active) .topbar .sub,
      body:has(#nav a[data-route="labels"].active) .topbar .sub,
      body:has(#nav a[data-route="sales"].active) .topbar .sub,
      body:has(#nav a[data-route="customers"].active) .topbar .sub,
      body:has(#nav a[data-route="settings"].active) .topbar .sub,
      body:has(#nav a[data-route="procurement"].active) .topbar .sub,
      body:has(#nav a[data-route="lowStock"].active) .topbar .sub {
        display: none;
      }
      body:has(#nav a[data-route="inventory"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="labels"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="sales"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="customers"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="settings"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="procurement"].active) #view .proc-head > div:first-child {
        display: block;
        min-width: 0;
      }
      body:has(#nav a[data-route="inventory"].active) #view .page-head > div:first-child h2,
      body:has(#nav a[data-route="labels"].active) #view .page-head > div:first-child h2,
      body:has(#nav a[data-route="sales"].active) #view .page-head > div:first-child h2,
      body:has(#nav a[data-route="customers"].active) #view .page-head > div:first-child h2,
      body:has(#nav a[data-route="settings"].active) #view .page-head > div:first-child h2,
      body:has(#nav a[data-route="procurement"].active) #view .proc-head > div:first-child h2 {
        display: none;
      }
      body:has(#nav a[data-route="inventory"].active) #view .page-head > div:first-child p,
      body:has(#nav a[data-route="labels"].active) #view .page-head > div:first-child p,
      body:has(#nav a[data-route="sales"].active) #view .page-head > div:first-child p,
      body:has(#nav a[data-route="customers"].active) #view .page-head > div:first-child p,
      body:has(#nav a[data-route="settings"].active) #view .page-head > div:first-child p,
      body:has(#nav a[data-route="procurement"].active) #view .proc-head > div:first-child p {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.4;
      }
      body:has(#nav a[data-route="inventory"].active) #view .page-head,
      body:has(#nav a[data-route="labels"].active) #view .page-head,
      body:has(#nav a[data-route="sales"].active) #view .page-head,
      body:has(#nav a[data-route="customers"].active) #view .page-head,
      body:has(#nav a[data-route="settings"].active) #view .page-head {
        align-items: center;
        min-height: 40px;
        margin-bottom: 20px;
      }
      body:has(#nav a[data-route="procurement"].active) #view .proc-head {
        align-items: center !important;
      }

      /* Supplier textareas: two-line content is vertically centered in the standard field. */
      #view .proc-wrap textarea.input {
        box-sizing: border-box;
        height: 52px;
        min-height: 52px;
        padding: 6px 14px;
        line-height: 20px;
        resize: vertical;
      }

      /* POS product-card overlays must sit above the product image. */
      #view .pcard .sku,
      #view .pcard .in-cart { z-index: 2; }
    `;
    document.head.appendChild(style);
  }

  const fixDashboardGreeting = () => {
    const active = document.querySelector('#nav a[data-route="dashboard"].active');
    if (!active) return;
    const heading = document.querySelector('#view .page-head h2');
    if (heading && /,\s*Alex\b/.test(heading.textContent)) {
      heading.textContent = heading.textContent.replace(/,\s*Alex\b/, ", Anand");
    }
  };

  const observer = new MutationObserver(fixDashboardGreeting);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener("hashchange", () => setTimeout(fixDashboardGreeting, 0));
  fixDashboardGreeting();
})();
