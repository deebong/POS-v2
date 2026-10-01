// Cross-module UX standards shared by the static POS shell.
// Keeps newly added pages aligned with the established shell instead of duplicating page titles.
(() => {
  const STYLE_ID = "ux-standards-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* The top shell already owns the page title/subtitle. Keep body modules focused on content. */
      body:has(#nav a[data-route="inventory"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="labels"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="sales"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="customers"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="settings"].active) #view .page-head > div:first-child,
      body:has(#nav a[data-route="procurement"].active) #view .proc-head > div:first-child {
        display: none;
      }
      body:has(#nav a[data-route="inventory"].active) #view .page-head,
      body:has(#nav a[data-route="labels"].active) #view .page-head,
      body:has(#nav a[data-route="sales"].active) #view .page-head,
      body:has(#nav a[data-route="customers"].active) #view .page-head,
      body:has(#nav a[data-route="settings"].active) #view .page-head {
        justify-content: flex-end;
        min-height: 0;
        margin-bottom: 16px;
      }
      body:has(#nav a[data-route="procurement"].active) #view .proc-head {
        justify-content: flex-end;
        min-height: 0;
      }
      /* Textareas in supplier forms use the same vertical rhythm as the standard inputs. */
      #view .proc-wrap textarea.input {
        box-sizing: border-box;
        min-height: 52px;
        padding: 11px 14px;
        line-height: 1.45;
      }
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
