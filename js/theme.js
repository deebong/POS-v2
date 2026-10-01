// Store colour theme: one brand colour → a full set of shades used by buttons, icons and highlights.
import { DEFAULT_SETTINGS } from "./data/logic.js";

export const THEME_PRESETS = [
  ["#0f9d58", "Fresh green"],
  ["#2563eb", "Ocean blue"],
  ["#7c3aed", "Royal purple"],
  ["#db2777", "Berry pink"],
  ["#dc2626", "Chilli red"],
  ["#ea580c", "Saffron"],
  ["#0891b2", "Teal"],
  ["#b45309", "Masala brown"],
  ["#1f2937", "Charcoal"],
];

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function normalizeColor(v) {
  const s = String(v || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  return DEFAULT_SETTINGS.themeColor;
}

export function themeVars(color) {
  const hex = normalizeColor(color);
  const rgb = toRgb(hex);
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  return {
    "--primary": hex,
    "--primary-600": toHex(mix(rgb, black, 0.12)),
    "--primary-700": toHex(mix(rgb, black, 0.3)),
    "--primary-50": toHex(mix(rgb, white, 0.92)),
    "--primary-100": toHex(mix(rgb, white, 0.8)),
    "--primary-rgb": rgb.join(", "),
    "--on-primary": luminance(rgb) > 0.5 ? "#0f1b2d" : "#ffffff",
  };
}

export function applyTheme(settings = {}) {
  const vars = themeVars(settings.themeColor);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const sidebar = ["light", "brand", "dark"].includes(settings.sidebarTheme) ? settings.sidebarTheme : "light";
  root.setAttribute("data-sidebar", sidebar);

  // Keep browser/PWA chrome synchronized with the selected store colour.
  // Chromium/Edge can update the page theme colour immediately; installed
  // Windows PWA title bars may continue using the manifest value until the
  // app is restarted, because that metadata is owned by the browser shell.
  const color = vars["--primary"];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
  const msTile = document.querySelector('meta[name="msapplication-TileColor"]');
  if (msTile) msTile.setAttribute("content", color);

  try {
    // Read by the tiny script in index.html so the right colours show before the app loads.
    localStorage.setItem("pos.theme", JSON.stringify({ vars, sidebar }));
  } catch {
    /* storage full / disabled */
  }
}
