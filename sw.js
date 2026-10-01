/* FreshMart POS service worker — makes the app installable and lets it start with no internet.
 * App files are pre-cached ("app shell"); your data lives in IndexedDB, not here.
 * Bump VERSION whenever any file below changes. Updates are activated automatically. */
const VERSION = "ci-017d35d2cf0a";
const CACHE = `freshmart-pos-${VERSION}`;
const FONT_CACHE = "freshmart-pos-fonts";
const IMG_CACHE = "freshmart-pos-images";
const ASSETS = [
  "index.html", "manifest.webmanifest", "css/styles.css", "css/custom-select.css", "css/procurement.css", "css/returns.css",
  "vendor/jsQR.js", "vendor/qrcode.js", "apps-script/Code.gs", "apps-script/Procurement.gs", "apps-script/Returns.gs",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png",
  "js/app.js", "js/analytics.js", "js/barcode.js", "js/custom-select.js", "js/procurement-router.js", "js/procurement.js", "js/returns-exchanges.js", "js/customers.js", "js/ux-standards.js", "js/performance.js",
  "js/dashboard.js", "js/inventory.js", "js/labels.js", "js/media.js", "js/pos.js", "js/pwa.js", "js/qr.js", "js/receipt.js", "js/sales.js", "js/scanner.js", "js/settings.js", "js/store.js", "js/theme.js", "js/transfer.js", "js/ui.js",
  "js/data/backend.js", "js/data/engine.js", "js/data/folder-backup.js", "js/data/hybrid-adapter.js", "js/data/idb.js", "js/data/logic.js", "js/data/local-adapter.js", "js/data/sample.js", "js/data/sheets-adapter.js",
];
const scopeUrl = new URL(self.registration.scope);
const INDEX_URL = new URL("index.html", scopeUrl).href;
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(ASSETS.map(async (a) => {
      const req = new Request(new URL(a, scopeUrl), { cache: "reload" });
      const res = await fetch(req); if (!res.ok) throw new Error(`${a} → HTTP ${res.status}`); await cache.put(req, res);
    }));
    const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason && r.reason.message);
    if (failed.length) console.warn("[FreshMart POS] not available offline:", failed);
    if (!(await cache.match(INDEX_URL))) throw new Error("index.html could not be cached");
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadPreviousAppCache = keys.some((k) => k.startsWith("freshmart-pos-") && k !== CACHE && k !== FONT_CACHE && k !== IMG_CACHE);
    await Promise.all(keys.filter((k) => k.startsWith("freshmart-pos-") && k !== CACHE && k !== FONT_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (hadPreviousAppCache) { const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true }); await Promise.all(windows.filter((client) => client.url.startsWith(scopeUrl.href)).map((client) => (typeof client.navigate === "function" ? client.navigate(client.url).catch(() => null) : null))); }
  })());
});
self.addEventListener("message", (event) => { if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting(); if (event.data && event.data.type === "VERSION" && event.ports[0]) event.ports[0].postMessage(VERSION); });
self.addEventListener("fetch", (event) => {
  const req = event.request; if (req.method !== "GET") return; const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(scopeUrl.pathname)) { if (req.mode === "navigate") { event.respondWith(caches.match(INDEX_URL).then((hit) => hit || fetch(req))); return; } event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }))); return; }
  if (req.destination === "image" && url.origin !== self.location.origin) { event.respondWith(caches.open(IMG_CACHE).then(async (cache) => { const hit = await cache.match(req); if (hit) return hit; try { const res = await fetch(req); if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; } catch (e) { return Response.error(); } })); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { event.respondWith(caches.open(FONT_CACHE).then(async (cache) => { const hit = await cache.match(req); const refresh = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit); return hit || refresh; })); }
});
