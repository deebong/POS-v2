# FreshMart POS — HTML / CSS / JS · installable PWA · works offline · syncs to Google Sheets

A complete grocery point-of-sale: billing, inventory, QR codes, invoices and a dashboard.
**Frontend:** plain HTML + CSS + JavaScript (ES modules, no build step, no framework).
**Backend:** a Google Sheet, exposed through a small Google Apps Script web app.

```
public/pos/
├── index.html               app shell
├── css/styles.css           design system
├── vendor/                  jsQR (camera scanning) + qrcode-generator (QR creation) — both MIT
├── manifest.webmanifest     PWA manifest (install as a Windows desktop app)
├── sw.js                    service worker: caches the app so it starts without internet
├── icons/                   app icons
├── apps-script/Code.gs      ← paste into Google Apps Script: this is your "server"
└── js/
    ├── app.js               router, sync status, global scanner
    ├── pos.js  dashboard.js  inventory.js  labels.js  sales.js  settings.js   (screens)
    ├── store.js             client state + all data access
    ├── qr.js  scanner.js  receipt.js  ui.js  analytics.js
    └── data/
        ├── backend.js           picks the storage mode
        ├── local-adapter.js     "This PC only" (IndexedDB)
        ├── hybrid-adapter.js    "This PC + Google Sheets" — offline-first queue + sync
        ├── sheets-adapter.js    fetch() → Apps Script web app ("Google Sheets live" + sync transport)
        ├── engine.js            local business logic + replay of queued changes (mirrors Code.gs)
        ├── idb.js               IndexedDB key-value store
        ├── folder-backup.js     automatic backup to a folder on the PC (File System Access API)
        └── logic.js sample.js
```

## Run it
Any static file server works (ES modules need `http://`, not `file://`):

```bash
cd public/pos && python3 -m http.server 8080     # or: npx serve public/pos
```
Open http://localhost:8080 — it starts in **Demo mode** with sample data stored in your browser.

## Connect Google Sheets (2 minutes)
1. Create a new Google Sheet.
2. **Extensions ▸ Apps Script** → delete the sample code → paste `public/pos/apps-script/Code.gs` → Save.
3. **Deploy ▸ New deployment ▸ Web app** → *Execute as: Me*, *Who has access: Anyone* → Deploy → authorise.
4. Copy the Web app URL (ends in `/exec`).
5. In the POS: **Settings ▸ Data source**, paste the URL, click **Connect**. Tabs are created automatically:
   `Products, Sales, SaleItems, StockMovements, Settings`.

Optional: set `API_KEY` at the top of `Code.gs` and enter the same key in Settings.
After editing `Code.gs`, redeploy via *Manage deployments ▸ New version*.

## How it stays correct
- Writes go through a script lock, so two counters can't sell the last item twice.
- Stock, prices and totals are re-validated on the server for every bill.
- Each payment carries a `clientRef`; if a response is lost and the cashier retries, the backend returns the
  original bill instead of charging twice.
- The POS re-syncs every 45 s (and on demand via the status pill), so several counters stay in step.

## Notes
- Google Apps Script calls take ~0.5–2 s. The UI keeps data in memory, so browsing is instant; only saves wait.
- Invoice history loads the last 90 days; older invoices are still found by scanning/looking up the invoice number.
- The Next.js files in `src/` are only a static host for the preview environment. The app itself doesn't use them.

## Storage modes (Settings ▸ Data storage & sync)
| Mode | Works offline | Where data lives | Best for |
|---|---|---|---|
| **This PC only** | ✅ fully | IndexedDB on this computer | a single till, no cloud |
| **This PC + Google Sheets** (recommended) | ✅ fully | IndexedDB on this PC, synced to the sheet | normal use; one or more tills |
| **Google Sheets live** | ❌ | the sheet only | strict real-time stock across tills |

### How offline-first sync works
- Every sale, stock change, product edit or void is saved on the PC **first** (billing never waits for the internet)
  and added to an outbox queue with a unique `opId`.
- When online, the queue is sent in order to the Apps Script `syncBatch` action, then the latest data is downloaded
  (every ~45 s, when the connection returns, or via the status pill). Changes from other tills arrive the same way.
- The sheet records each `opId` in the **SyncLog** tab, so a change is never applied twice — even if the connection
  drops mid-sync and the PC retries.
- Offline sales get **device-scoped invoice numbers** (`INV-20250101-C1-0007`; set the Counter ID per till), so tills
  never clash and the number printed on the receipt stays valid after syncing.
- Conflicts: sales that happened are always kept (stock may go negative and is flagged in *Sync notes*); stock
  additions/removals are merged; edits are last-writer-wins; a product created offline with a SKU that already exists
  on the sheet is rejected and reported.
- Only one window of the POS can be open at a time on a PC (a second window offers “Use it in this window”).

### Install on Windows (PWA)
Open the POS in **Microsoft Edge** or **Chrome** → click **Install app** in the top bar (or Edge: ⋯ ▸ Apps ▸ Install
this site as an app). It gets a Start-menu entry and its own window, and starts without internet.
Requires HTTPS (or `localhost`). Data is stored in the browser profile under `%LOCALAPPDATA%`; click
**Keep permanently** in Settings so Windows/the browser never clears it.

### Backups
- **Folder backup** (Edge/Chrome): choose a folder such as `Documents\FreshMart POS` or a OneDrive folder. The app keeps
  `FreshMart-POS-data.json` current and 14 daily files in `backups\` — including changes not yet synced.
  After a restart the browser may ask you to click **Reconnect** once.
- **Download backup / Restore from file** works in every browser. Restoring in PC + Sheets mode re-queues anything
  the sheet doesn't have yet (duplicates are ignored).

### Upgrading an existing sheet
Paste the new `Code.gs` into Apps Script and **Deploy ▸ Manage deployments ▸ Edit ▸ New version**. The `SyncLog` tab
is created automatically. The POS tells you if the script is too old for offline sync.

## Tests
```bash
node tests/apps-script.test.mjs            # runs the real Code.gs against an in-memory Google Sheets mock
npm i -D playwright && npx playwright install chromium
node tests/e2e-offline.mjs                 # browser test (app running on http://localhost:3000)
```
When you change any file in `public/pos`, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Windows 7 / older PCs — Windows kit
Download **`/download/freshmart-pos-windows.zip`** from the running app (also linked in Settings ▸ Desktop app &
offline). It contains the POS (`app/`), `Start FreshMart POS.bat`, a tiny local web server for the PowerShell 2.0 that
ships with Windows 7 (`server/pos-server.ps1`; no install, no admin rights, only reachable from the PC itself) and
`README-WINDOWS.txt` with step-by-step instructions.

- Browsers: **Chrome 109 / Edge 109** (last versions for Windows 7; installable app + folder backups) or **Firefox 115 ESR**
  (works offline; no app install, no folder backups). Internet Explorer is not supported — it shows a clear message.
- Run the .bat once → the POS opens at `http://127.0.0.1:8765/` → *Install app*. After that the installed app opens even
  when the server window is closed (the service worker serves it).
- Always use the same address; the browser stores POS data per address.
- Verified with the real Chromium 109.0.5414.46 and Firefox 115.0 engines: `tests/compat-win7.mjs`.

## Hosting on GitHub Pages (or any static host)
Upload the **contents of `public/pos`** (including the hidden `.nojekyll` file, `manifest.webmanifest`, `sw.js` and the
`icons/` folder) to your repo and enable Pages. Open `https://<user>.github.io/<repo>/`.
- **Install:** click **Install app** (top bar) — Chrome/Edge show their install dialog, which adds a desktop shortcut and
  Start-menu entry. An install bar also appears automatically as soon as the browser allows installing. If nothing
  happens, the help dialog lists what's missing (HTTPS, manifest, icons, service worker) and offers a `.url` shortcut.
- After uploading a new version, bump `VERSION` in `sw.js`; open copies show “Update now”.

## Demo data, import & export (Settings ▸ Import & export)
- **Load demo data:** 52 sample products (₹ prices, GST) + ~2 weeks of sample bills, written straight into your Google
  Sheet (or this PC). Also offered automatically when you connect an empty sheet.
- **Export:** all data (.json), products / invoices / invoice lines (.csv, opens in Excel with ₹).
- **Import:** a data file (.json, optionally including store settings) or products (.csv). Products are matched by SKU and
  invoices by number, so importing twice never duplicates anything.

## Appearance & product photos (Settings ▸ Store profile ▸ Appearance)
- Brand colour (presets or any colour), side-menu style (light / brand / dark) — synced to the sheet's Settings tab.
- Product pictures: **Emoji** or **Photos**. With photos, edit a product and choose a picture from the PC (uploaded to
  your Google Drive folder “FreshMart POS Images”, link saved in the Products tab `imageUrl` column), or paste a web /
  Google Drive link. In “This PC only” mode photos are resized (~20–40 KB) and stored with the product.
- The side menu can be docked to an icon rail (button at the bottom of the menu, or the panel icon in the top bar).

**Existing sheets:** paste the new `Code.gs` (v1.2.0) and *Deploy ▸ Manage deployments ▸ Edit ▸ New version*. Google asks
for Drive permission (needed for photo uploads). If uploads say “authorization required”, run the `authorize` function
once in the Apps Script editor. The `imageUrl` column is added to your Products tab automatically.

Tests: `node tests/apps-script.test.mjs`, `node tests/e2e-features.mjs`, `node tests/e2e-offline.mjs`.
