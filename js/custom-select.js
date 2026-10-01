/* FreshMart POS — consistent cross-platform select dropdowns.
 * Keeps the real <select> in the DOM for form logic, automation and accessibility,
 * while rendering the opened option list as normal HTML so Windows native menus do
 * not take over the visual style.
 */
(() => {
  const OPEN = "custom-select-open";
  let active = null;

  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

  function close() {
    if (!active) return;
    const { menu, trigger, select } = active;
    menu.remove();
    trigger.classList.remove(OPEN);
    trigger.setAttribute("aria-expanded", "false");
    active = null;
    if (select.dataset.csRestoreFocus === "1") {
      delete select.dataset.csRestoreFocus;
      trigger.focus({ preventScroll: true });
    }
  }

  function position(menu, trigger) {
    const r = trigger.getBoundingClientRect();
    const gap = 5;
    const maxH = Math.min(280, Math.max(120, window.innerHeight - 24));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const openAbove = below < 190 && above > below;
    const height = Math.min(maxH, menu.scrollHeight || maxH);
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
    menu.style.width = `${r.width}px`;
    menu.style.maxHeight = `${maxH}px`;
    menu.style.top = openAbove
      ? `${Math.max(8, r.top - Math.min(height, above) - gap)}px`
      : `${Math.min(window.innerHeight - 8, r.bottom + gap)}px`;
  }

  function refresh(cs) {
    const { select, trigger, label, options } = cs;
    const selected = select.options[select.selectedIndex];
    label.textContent = selected ? selected.textContent.trim() : "";
    options.forEach((item, i) => {
      const option = select.options[i];
      item.classList.toggle("selected", !!option?.selected);
      item.setAttribute("aria-selected", option?.selected ? "true" : "false");
      item.disabled = !!option?.disabled;
      const check = item.querySelector(".custom-select-check");
      if (option?.selected && !check) {
        item.insertAdjacentHTML("beforeend", '<span class="custom-select-check" aria-hidden="true">✓</span>');
      } else if (!option?.selected && check) {
        check.remove();
      }
    });
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-disabled", select.disabled ? "true" : "false");
  }

  function open(cs, focusSelected = true) {
    if (cs.select.disabled) return;
    if (active?.select === cs.select) {
      close();
      return;
    }
    close();

    const { select, trigger } = cs;
    const menu = document.createElement("div");
    menu.className = "custom-select-menu";
    menu.id = select.id ? `${select.id}-options` : `custom-select-options-${Date.now()}`;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", trigger.getAttribute("aria-label") || "Select an option");

    const options = [...select.options].map((option, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `custom-select-option${option.selected ? " selected" : ""}`;
      item.setAttribute("role", "option");
      item.dataset.index = String(i);
      item.setAttribute("aria-selected", option.selected ? "true" : "false");
      item.innerHTML = `<span>${esc(option.textContent.trim())}</span>${option.selected ? '<span class="custom-select-check" aria-hidden="true">✓</span>' : ""}`;
      item.disabled = option.disabled;
      item.addEventListener("click", () => {
        if (option.disabled) return;
        select.selectedIndex = i;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        trigger.focus({ preventScroll: true });
      });
      menu.appendChild(item);
      return item;
    });

    cs.options = options;
    cs.menu = menu;
    document.body.appendChild(menu);
    refresh(cs);
    trigger.classList.add(OPEN);
    trigger.setAttribute("aria-expanded", "true");
    active = cs;
    position(menu, trigger);

    if (focusSelected) {
      const current = options[select.selectedIndex] || options.find((o) => !o.disabled);
      if (current) requestAnimationFrame(() => current.focus({ preventScroll: true }));
    }
  }

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement) || select.dataset.customSelect === "1") return;
    select.dataset.customSelect = "1";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "select custom-select-trigger";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if (select.id) trigger.setAttribute("aria-controls", `${select.id}-options`);

    const label = document.createElement("span");
    label.className = "custom-select-label";
    const arrow = document.createElement("span");
    arrow.className = "custom-select-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = "<svg viewBox='0 0 24 24' focusable='false'><path d='m6 9 6 6 6-6'/></svg>";
    trigger.append(label, arrow);
    wrapper.appendChild(trigger);

    const cs = { select, wrapper, trigger, label, options: [], menu: null };
    refresh(cs);

    select.classList.add("custom-select-native");
    trigger.addEventListener("click", () => open(cs));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(cs, true);
      } else if (e.key === "Escape" && active?.select === select) {
        e.preventDefault();
        close();
      }
    });
    select.addEventListener("change", () => refresh(cs));
    new MutationObserver(() => refresh(cs)).observe(select, { attributes: true, attributeFilter: ["disabled"] });
  }

  function scan(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("select").forEach(enhance);
  }

  document.addEventListener("click", (e) => {
    if (!active) return;
    if (active.wrapper.contains(e.target) || active.menu.contains(e.target)) return;
    close();
  });
  document.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.key === "Escape" || e.key === "Tab") close();
  });
  window.addEventListener("resize", () => {
    if (active) position(active.menu, active.trigger);
  });
  window.addEventListener("scroll", () => {
    if (active) position(active.menu, active.trigger);
  }, true);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.matches?.("select")) enhance(node);
          scan(node);
        }
      });
    }
  });

  function init() {
    scan(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
