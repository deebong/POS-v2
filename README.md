# FreshMart POS — Source Repository

**Status reviewed:** 21 October 2026  
**Repository role:** authoritative development source for the POS frontend, Google Apps Script backend, tests and deployment workflows.

> **Release status:** The application has a broad set of implemented screens and local workflows, but it is not certified bug-free or fully production-ready. Several modules still need live Google Sheets, security, multi-counter and target-device verification. Read the current regression ledger before deciding release readiness.

## 1. Repository map and release targets

| Repository | Role | Working rule |
|---|---|---|
| [POS-platform-v2](https://github.com/deebong/POS-platform-v2) | Private source, Apps Script, tests, workflow and documentation | Authoritative place for code changes |
| [POS-v2-staging](https://github.com/deebong/POS-v2-staging) | Public staging frontend | Required target for acceptance testing; use disposable data |
| [POS-v2](https://github.com/deebong/POS-v2) | Production-facing static frontend | Do not publish without an explicit release decision |

The current release workflow, `.github/workflows/ci-publish.yml`, has previously published to `POS-v2` after a successful push to `main`. This caused a production-facing deployment even though the intended testing target was staging. **A green CI run is not release approval.** Inspect the workflow conditions before merging, dispatching or changing branch protection; do not assume production is protected simply because staging exists.

### Data environments

Use the designated disposable `POS_test_v1` Google Sheet and its dedicated Apps Script deployment for the current staging acceptance run. Keep a private mapping of test label → Sheet → Apps Script `/exec` URL → source commit → staging build. Do not create more Sheets without a specific test need, and do not place credentials or private setup codes in this README.

## 2. Current architecture

The POS runtime is a plain HTML/CSS/JavaScript progressive web app under `public/pos/`. The POS runtime does not require the Next.js/React scaffold under `src/`.

- **UI/runtime:** `public/pos/index.html`, CSS and JavaScript ES modules.
- **Local storage:** IndexedDB through the data adapters.
- **Cloud backend:** Google Sheets through Google Apps Script.
- **Sync/offline:** local, hybrid and Sheets adapters, sync engine and service worker. Offline queueing does not itself guarantee that every record type is synchronized or conflict-safe.
- **PWA:** `manifest.webmanifest` and `sw.js`.
- **Hosting:** static hosting such as GitHub Pages.
- **Windows compatibility:** `windows-kit/` and `tests/compat-win7.mjs` provide a compatibility path, but actual target PC/browser behavior must be tested.
- **Preview scaffold:** `src/` and Next.js configuration are for the preview host, not the POS runtime.

### Storage modes

| Mode | Main data location | Important limitation |
|---|---|---|
| This PC only | Browser IndexedDB | Data is device/browser-specific; export and backup must be verified |
| This PC + Google Sheets | IndexedDB plus Apps Script/Sheets sync | Verify queued writes, retries, conflict behavior and actual Sheet records |
| Google Sheets/live access | Cloud-backed operations where supported | Not equivalent to hybrid offline operation |

A configured Apps Script URL or a successful health response is not proof that all actions are connected, authorized or syncing correctly. After changing Apps Script source, deploy a new Web App version and confirm that the frontend uses the intended deployment URL.

## 3. Installation wizard and first-run setup

The installation flow has evolved; do not assume a specific number of screens without inspecting the current staging build. The intended setup areas are:

1. Store/business profile and contact numbers.
2. Initial administrator identity and access.
3. Storage mode and Google Sheets / Apps Script connection.
4. Language and business preferences where available.
5. Branding: colors, appearance, logo/favicon, tagline and receipt branding where supported.
6. Review, initialization and entry into the POS.

The existence of a setup screen does not certify every field or recovery path. Previously reported acceptance issues include the dashboard displaying the wrong administrator name, a default phone number not taken from setup, tagline/branding values reverting, and stale Apps Script version warnings. Verify configured values after setup, navigation, reload and re-login.

### Safe installation/reinstallation

- Back up local data before clearing browser storage or uninstalling/reinstalling the PWA.
- If the app says the backend is already installed, first identify the connected Sheet and Apps Script deployment. Do not bypass the warning or repeatedly generate setup codes without knowing which backend is being initialized.
- For a new test environment, use a clearly labelled disposable Sheet and deployment, and record the mapping privately.
- Never treat a setup-code success as proof of a complete backend connection.

## 4. Implemented modules — current status

**Status meanings:** *Code present* means the module exists in the current source. *Local* means its state is primarily stored on this PC. *Partial / acceptance pending* means functionality exists but integration or live/device checks remain. None of these labels means “zero bugs.”

| Module | Current status | Implemented scope and known boundary |
|---|---|---|
| Dashboard | Code present | Sales snapshot, KPIs and operational overview; verify figures against underlying transactions and active store/operator |
| POS / Billing | Code present | Product search, categories, cart, quantities, discounts/tax, customer details, cash/card/UPI tender selection, hold/restore, checkout and receipt flow; tender selection is not gateway integration |
| Inventory | Code present | Product CRUD, SKU/barcode, price/cost/tax, stock, reorder level, images, CSV import/export and stock adjustment; verify stable record updates and live sync |
| Product Labels | Code present | Label search/filters, size/copies, price toggle, QR/barcode, select all and print; physical size/scaling needs target-printer verification |
| Invoices / Sales | Code present | Sales history, invoice search/details, receipt/reprint, void flow and customer purchase history; verify sale/void/return consistency |
| Customers | Code present | Customer directory and sales-derived counts/spend/average bill/history; verify after voids and returns |
| Suppliers & Purchases | Code present | Supplier CRUD/activation, receiving, purchase history and incoming stock; verify backend persistence and stock effects |
| Returns & Exchanges | Code present | Invoice lookup, partial return/exchange, refund/difference calculation, stock restoration and return history; live Sheet transaction and authorization checks remain necessary |
| Cash Drawer | Local workflow present | Opening/closing, float, cash-in/out, expected/counted cash and variance; central Sheets persistence and physical drawer pulse are not established |
| Day Close | Local workflow present | Business-date reconciliation, payment/refund/tax summary, drawer reconciliation, history, CSV export and finalization; central persistence/cross-counter reconciliation incomplete |
| Audit Log | Local workflow present | Operator activity history, filters/search and CSV export; central, tamper-resistant audit trail is not established |
| Low Stock | Code present | Low/out-of-stock detection, reorder gap, cost value, filters, restock action and CSV export; verify calculations after sync/returns |
| Reports | Basic reporting present | Date range, net sales, average bill, refunds, payment methods, daily sales, top products, reconciliation and CSV export; advanced profit/GST/inventory/multi-counter reporting remains planned or incomplete |
| Loyalty | Partial/local | Member directory, earn-rate/tier settings, balances, ledger view, manual adjustment, redemption and CSV export; complete checkout earn/redeem/reversal and central ledger are incomplete |
| Staff & Users | Local security UI present | Admin/Manager/Cashier roles, permission model, salted PBKDF2 PIN handling, operator switching, activation/deactivation and PIN reset; server-authoritative identity/session security and cross-device enforcement are not certified |
| Settings | Code present; persistence acceptance pending | Storage/Sheets connection, import/export, store profile, appearance, product-image settings, backup/offline controls and install support; verify all values persist through navigation/reload/re-login |
| GST bill/export | Code present | GST bill/export workflow exists; verify rupee glyph, calculations, output and real print behavior |
| Scanner / barcode / QR | Browser integration present | Scanner, barcode and QR helper modules exist; test supported devices and actual browser/device behavior |
| PWA / offline | Code present; target-device acceptance pending | Manifest/service worker and offline paths exist; verify cache updates, installed-app reopen, offline transactions and sync recovery on target devices |
| Backup / restore | Partial | Local export/restore and supported folder/cloud backup paths exist; verify real destination, authorization, data integrity and restore behavior |
| Multi-store / multi-counter | Incomplete / release risk | Full store-scoped data/session isolation, server-side enforcement and end-to-end cross-counter consistency are not certified |
| Tamil / bilingual mode | Partial / acceptance pending | Localization/schema work exists in candidate history; verify create/edit/import/export/search/labels/receipt/GST and existing-sheet migration |

### Do not misread these statuses

- A screen existing is not proof that its backend records persist.
- Mock Apps Script tests do not prove live Sheet permissions, deployment URLs or actual data.
- Browser printing/scanning does not certify physical hardware compatibility.
- Local PIN hashing and role-based UI do not by themselves provide server-authoritative authentication.
- A green CI run proves only the assertions executed in that run.

## 5. Known regressions and acceptance checklist

The detailed, commit-linked status is maintained in [`docs/REGRESSION-AND-RELEASE-LOG.md`](docs/REGRESSION-AND-RELEASE-LOG.md). Use that file as the live regression ledger; do not copy stale test claims into this README.

Items requiring explicit staging or target-device evidence include:

1. **Operator switching:** Manager → Cashier and Cashier → Manager must return to Dashboard, refresh page/sidebar/navigation according to the new role, and remove access to protected content from the previous operator.
2. **Cash Drawer:** open/close, cash-in/out, operator attribution, persistence and physical drawer behavior.
3. **Product Labels:** print dimensions and scaling on the target printer.
4. **Returns:** live Apps Script transaction, stock adjustment, refund/difference and authorization.
5. **Product editing:** update the same existing record/SKU, not create a duplicate.
6. **Tamil data:** create/edit/import/export/search/labels/receipt/GST output and existing Sheet compatibility.
7. **Settings:** configured phone, admin identity, tagline, colors and other values persist across save, navigation, reload and re-login.
8. **Backup/restore:** correct destination, permissions, data integrity and useful failure messages.
9. **Authentication:** wrong PIN, lockout, logout, expiry, role changes, server rejection and no stale protected UI.
10. **Sheets sync / store isolation:** distinct store endpoints, IndexedDB/localStorage scope, queued operations, sessions, retries and conflict handling.
11. **PWA/cache:** service-worker activation, installed-app reopen, offline behavior, update and persistence.
12. **Receipts/GST:** rupee symbol, print preview, receipt layout, GST export and real print output.

Record each item as one of: **code present**, **automated test passed**, **live backend verified**, **target device verified**, or **not verified**. Add the test run/commit and observations. Do not mark an item complete based on a nearby test that does not exercise it.

## 6. Source file structure

This is the current high-level tree for the POS runtime. It is intentionally a map of responsibilities, not a copy of every file or a claim that every module is complete.

```text
POS-platform-v2/
├── public/pos/
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icons/
│   ├── vendor/
│   ├── css/
│   │   ├── styles.css
│   │   ├── pos-fixes.css
│   │   ├── custom-select.css
│   │   ├── procurement.css
│   │   ├── returns.css
│   │   ├── low-stock.css
│   │   ├── reports.css
│   │   ├── cash-drawer.css
│   │   ├── eod-closing.css
│   │   ├── audit-log.css
│   │   ├── loyalty.css
│   │   └── staff.css
│   ├── js/
│   │   ├── app.js, ui.js, store.js, theme.js, i18n.js
│   │   ├── installation.js, auth.js, staff.js, approval.js
│   │   ├── dashboard.js, pos.js, inventory.js, labels.js
│   │   ├── sales.js, customers.js, procurement.js, procurement-router.js
│   │   ├── returns.js, returns-exchanges.js, gst-bill.js, receipt.js
│   │   ├── cash-drawer.js, eod-closing.js, audit-log.js, low-stock.js
│   │   ├── reports.js, loyalty.js, settings.js
│   │   ├── scanner.js, barcode.js, qr.js, media.js
│   │   ├── analytics.js, performance.js, pwa.js, transfer.js
│   │   ├── custom-select.js, ux-standards.js
│   │   └── data/
│   │       ├── backend.js, engine.js, logic.js, idb.js, sample.js
│   │       ├── local-adapter.js, hybrid-adapter.js, sheets-adapter.js
│   │       └── folder-backup.js, cloud-backup.js
│   └── apps-script/
│       ├── Code.gs
│       ├── Procurement.gs
│       ├── ProcurementDemoSeed.gs
│       └── Returns.gs
├── tests/
│   ├── apps-script.test.mjs
│   ├── gas-mock.mjs
│   ├── e2e-features.mjs
│   ├── e2e-offline.mjs
│   ├── compat-win7.mjs
│   └── package.json
├── windows-kit/
├── docs/
│   └── REGRESSION-AND-RELEASE-LOG.md
├── src/                       preview-host scaffold, not POS runtime
├── package.json
├── next.config.ts
└── .github/workflows/ci-publish.yml
```

Always verify actual paths against the current branch before editing; files and names may evolve.

## 7. Apps Script backend and data boundaries

Apps Script sources are in `public/pos/apps-script/`:

- **`Code.gs`:** core POS API and core data actions.
- **`Procurement.gs`:** supplier/purchase backend actions.
- **`Returns.gs`:** returns/exchanges backend actions.
- **`ProcurementDemoSeed.gs`:** procurement demo seed data.

The core data path includes products, sales, sale items, stock movements, settings and sync logging. Procurement and Returns add their relevant data structures/actions. Cash Drawer, Day Close, Audit Log and parts of Loyalty remain local operational stores in the documented implementation; this is not sufficient for reliable multi-counter operation until central persistence, authorization and synchronization are implemented and verified.

For test parity, load all required Apps Script files into the same test VM/global context, as Apps Script does. Mock-backend success must be followed by disposable live-Sheet verification for release-critical operations.

## 8. Automated tests and their limits

Current test areas include:

- `tests/apps-script.test.mjs` — Apps Script regression tests.
- `tests/e2e-features.mjs` — browser feature/end-to-end checks.
- `tests/e2e-offline.mjs` — offline and PWA behavior.
- `tests/compat-win7.mjs` — legacy browser/Windows compatibility checks.
- `tests/gas-mock.mjs` — Apps Script test harness.
- `.github/workflows/ci-publish.yml` — CI, release checks and deployment jobs.

Automated tests are intended to catch repeatable regressions before staging. They cannot prove every workflow works, nor can mocks prove live Google permissions, quotas, deployment configuration, real Sheet contents, printer/scanner/scale behavior or every target device. Expand tests when a real defect is found and record exactly what the test does and does not prove.

## 9. Planned roadmap — retained

These are planned/extended capabilities. Their presence in this list does not imply that they are implemented.

### Payments and checkout
- Multiple UPI payment IDs with a configurable default.
- Payment gateway integrations with verified callbacks/webhooks, pending/failed-payment recovery, reconciliation, refunds and duplicate-payment protection.
- Split/multiple tender where required and payment reference IDs on invoices.

### Hardware
- Thermal receipt printers, including compatible ESC/POS devices.
- Barcode and QR scanners.
- Weighing-machine integration and weighted barcodes.
- Cash-drawer pulse through compatible printers, label-printer profiles, customer display and hardware diagnostics.
- Clear hardware/browser compatibility guidance and a suitable bridge where browser APIs are insufficient.

### Delivery and logistics
- Delivery orders, slots, assignment and status tracking.
- ETA/ETD, hand-off workflows, delivery-provider/third-party logistics integration and customer notifications.

### Finance, accounting and reporting
- Expense and cash-flow tracking.
- Profit/margin, category, cashier and payment reconciliation reports.
- GST summaries and agreed accounting exports.
- Supplier balances, purchase orders, purchase returns and supplier payment tracking.
- Tally migration and ERP/accounting/ecommerce/other-app integrations.

### Industry-specific modules
- Grocery: product images, weighted items, expiry/batch tracking, stocktake and fast barcode billing.
- Restaurant/café: menus, modifiers, recipes and table/order workflows where required.
- Apparel/footwear: size/color variants and product matrices.
- Additional industry-specific fields, workflows and terminology without maintaining a separate code fork for every client.

### Themes, onboarding and plugins
- Client- and industry-specific dashboards, navigation and branding.
- Store logo, colors, favicon, receipt design, language and accessibility preferences.
- Guided setup for business type, store profile, administrator, storage/backend, branding and initial modules.
- Enable/disable plugins with declared dependencies, settings, permissions, compatibility and migration rules.
- Grocery product-image helper/plugin.
- Tally migration plugin and ERP/other-application integrations.
- Plugin catalog/marketplace, safe updates and rollback.
- Non-technical founder onboarding with sensible defaults and no manual code editing.

### Platform expansion
- Server-authoritative staff/session authorization.
- Reliable cross-device sync, conflict handling, store-scoped isolation and multi-branch management.
- Central administration, backup/restore verification and operational diagnostics.
- Licensing/subscriptions if required by the commercial model.
- Tamil/English and other languages, promotions, complete loyalty checkout integration, CRM insights, notifications and advanced analytics.

## 10. Working and release rules

1. **One candidate branch:** record the branch and exact commit in the regression ledger. Avoid parallel branches fixing the same defect.
2. **Staging first:** test candidate builds against disposable data in `POS-v2-staging`.
3. **No implicit production release:** production publication requires an explicit release decision and a workflow configured to enforce it.
4. **Evidence-based status:** distinguish code present, automated tests, live-backend verification and target-device verification.
5. **Protect test data:** do not clear local storage or replace a Sheet without a known backup and purpose.
6. **Focused fixes:** reproduce a defect, identify the root cause, add a regression test, run CI, deploy to staging, then execute the relevant live acceptance check.
7. **Keep roadmap separate from acceptance:** preserve future features while clearly marking what is not yet delivered.
8. **No claims of zero bugs:** release readiness is based on a defined acceptance suite and known limitations, not an absolute guarantee.

## 11. Current next steps

1. Reconcile the source commit, staging build and production-facing build; the three must not be assumed identical.
2. Verify that production publication is gated explicitly rather than triggered by routine source pushes.
3. Reproduce the outstanding items in the regression ledger on staging, beginning with operator switching/role-based navigation, settings persistence, returns and sync/data isolation.
4. Fix only reproducible defects, add targeted tests, run CI and deploy candidates to staging.
5. Complete live disposable-Sheet and target-device checks and record evidence for every acceptance item.
6. Reassess whether a clean POS v3 is warranted only after source, branches, deployment versions and Sheet mappings are reconciled.

**Related documentation:** [Regression and Release Log](docs/REGRESSION-AND-RELEASE-LOG.md) · [Security Phases](SECURITY_PHASES.md)
