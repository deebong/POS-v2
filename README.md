# FreshMart POS

A grocery Point-of-Sale application built as an installable PWA with a plain HTML/CSS/JavaScript runtime, offline-first local storage, and optional Google Sheets synchronization.

> **Current implementation:** the production-facing application is `public/pos/`. The `src/` directory is the Next.js/React preview-host scaffold and is not the POS runtime.

## Current architecture

- **Frontend:** plain HTML + CSS + JavaScript ES modules; no framework and no build step for the POS runtime.
- **Local database:** IndexedDB.
- **Cloud database / sync:** Google Sheets through Google Apps Script.
- **Offline mode:** supported through the local adapter and service worker.
- **Recommended storage mode:** This PC + Google Sheets (offline-first).
- **PWA:** installable on supported Chrome/Edge browsers.
- **Windows 7:** a dedicated local-server kit is included for the supported legacy browser versions.
- **Demo mode:** available without connecting Google Sheets.

---

## Implemented modules

The current navigation and implementation contain these modules:

| Module | Current status | Main capabilities |
|---|---|---|
| Dashboard | Implemented | Sales snapshot, KPIs, recent activity and operational overview |
| POS / Billing | Implemented | Product search, categories, cart, quantity controls, discounts, tax, customer details, cash/card/UPI tender selection, hold/restore, QR/barcode scanning, checkout and receipt flow |
| Inventory | Implemented | Product CRUD, SKU/barcode, price/cost/tax, stock, reorder level, product images, CSV import/export, stock adjustment |
| Product Labels | Implemented | Search/filter, category filter, label size, copies, price toggle, QR/barcode labels, select all, print |
| Invoices | Implemented | Sales history, invoice search, invoice details, reprint/receipt flow, void handling, customer purchase history |
| Customers | Implemented | Customer directory derived from sales, purchase counts, spend, average bill and invoice history |
| Suppliers & Purchases | Implemented | Supplier directory, supplier CRUD, activate/deactivate, purchase receiving, purchase history and incoming stock |
| Returns & Exchanges | Implemented | Invoice lookup, partial returns, exchanges, refund/difference calculation, stock restoration, replacement stock validation and return history |
| Cash Drawer | Implemented locally | Open/close drawer, opening float, cash in/out, expected cash, counted cash, variance and previous sessions |
| Day Close | Implemented locally | Business-date reconciliation, sales/payment/refund/tax summary, drawer reconciliation, completed-sales history, CSV export and finalization |
| Audit Log | Implemented locally | Operator activity history, filters, search, CSV export and local clearing |
| Low Stock | Implemented | Out-of-stock/low-stock detection, reorder gap, cost value, filters, search, restock action and CSV export |
| Reports | Implemented | Date-range sales report, net sales, average bill, refunds, payment methods, sales by day, top products, reconciliation and CSV export |
| Loyalty | Implemented locally | Member directory, earn-rate configuration, tiers, points balance, member ledger, manual adjustments, redemption and CSV export |
| Staff & Users | Implemented locally | Staff directory, Admin/Manager/Cashier roles, permission model, salted PBKDF2 PINs, operator switching, activation/deactivation and PIN reset |
| Settings | Implemented | Storage mode, Google Sheets connection, import/export, store profile, appearance, product image settings, backup/offline controls and app installation support |

### Recent stability fixes

The following recurring table-rendering issue has been audited and fixed in all three affected modules:

- **Day Close → Completed sales**
- **Audit Log → Activity history**
- **Loyalty → Loyalty members**

The affected tables now use an isolated scroll/paint context, opaque sticky header cells, explicit `border-spacing: 0`, a higher header stacking level and a non-positioned body layer. The module entrance transform is also disabled for these table views so it cannot interfere with sticky table painting.

---

## Detailed development audit — 1 October 2026

The UI/module set is now substantially complete for the current POS scope. The remaining work is primarily **production integration, security, multi-counter consistency and operational hardening**, rather than adding another basic screen immediately.

### A. High-priority work still required

#### 1. Move locally stored operational modules to Google Sheets

The main product/sales data path is already designed around Google Sheets, but several newer modules still keep their records only in IndexedDB on the current PC.

Currently local-first/local-only:

- Cash Drawer sessions and movements
- Day Close finalization records
- Audit Log
- Loyalty configuration and manual point adjustments
- Reports consume local state and local return data

This is acceptable for a single-PC demo, but it is not sufficient for a multi-counter production POS. The next backend phase should add dedicated Sheets schemas/actions and offline sync queues for these domains.

Recommended Sheets/tables:

- `CashDrawerSessions`
- `CashDrawerMovements`
- `DayClosings`
- `AuditLog`
- `LoyaltyMembers`
- `LoyaltyLedger`
- optionally `ReportSnapshots` only if historical snapshots are required; most reports should remain derived from transactional data

Each syncable record should have an idempotent `opId`, device/counter ID, timestamps and server-side validation.

#### 2. Finish Loyalty integration with checkout

The Loyalty screen currently derives member balances from completed customer sales and stores manual adjustments locally. It does **not yet form a complete checkout loyalty workflow**.

Still required:

- Identify/select a loyalty customer during checkout.
- Show current points balance before payment.
- Earn points automatically when a qualifying sale is completed.
- Redeem points as a payment/discount rule during checkout.
- Prevent redemption beyond the available balance.
- Reverse/adjust points when a sale is voided or returned.
- Store the loyalty ledger centrally when Google Sheets mode is enabled.
- Define configurable earn/redeem rules rather than only the current simple spend-rate model.

#### 3. Staff / user management and operator identity\n\nA local Staff & Users module is now implemented as the first step of the operator/security layer. It provides Admin, Manager and Cashier roles, a permission matrix, salted PBKDF2 PIN storage, operator switching, account activation/deactivation, PIN reset and dynamic operator attribution in the shell, audit log and cash drawer.\n\nThe current implementation is deliberately local-first so it works offline. It is **not yet a server-authoritative multi-counter authentication system**. Google Sheets staff synchronization, server-side authorization, session expiry/lock policy and cross-device identity reconciliation remain required before production deployment.\n\n#### 4. Replace hard-coded operator identity with full cashier/session security

The current UI displays **Anand Ibrahim / Anand I** and several operational modules use fixed operator/counter values. This is intentional demo data, but it is not an authentication system.

Production work should introduce:

- Cashier/staff records
- Login/session handling
- PIN/password or another appropriate local authentication method
- Roles such as Cashier, Manager and Admin
- Permission checks for voids, refunds, price changes, stock adjustments, drawer operations, reports and settings
- Per-user audit attribution
- Counter/device identity
- Session timeout/lock

The application should continue to work offline, so authentication/session design must not depend on a live network for every transaction.

#### 5. Payment integration

Cash, card and UPI/QR currently exist as POS tender types, but the repository does not contain a live payment-gateway integration such as Razorpay, terminal API integration or payment webhook reconciliation.

If real electronic payments are required, add this as a separate integration layer rather than changing the core checkout calculation logic.

Required pieces would include:

- UPI intent/QR workflow if required
- Payment order creation
- Gateway callback/webhook verification
- Payment status reconciliation
- Failed/pending payment recovery
- Refund support
- Duplicate-payment protection
- Payment reference IDs on invoices

#### 6. Hardware integration

The application currently provides browser-based scanning and browser printing. A production retail deployment may additionally require:

- ESC/POS thermal receipt printing
- Barcode scanner keyboard/USB compatibility verification
- Automatic cash-drawer pulse through the receipt printer
- Customer display support, if required
- Label-printer profiles
- Hardware diagnostics in Settings

These should be optional adapters so the web/PWA version continues to work without proprietary drivers.

---

### B. Important reporting and business functionality still to develop

#### 7. Advanced reports / analytics

The current Reports module covers the basic operational report set. A later reporting phase should add:

- Gross margin / profit reporting using product cost
- Category performance
- Cashier performance
- Payment reconciliation
- Discount analysis
- Tax/GST summary
- Refund/return analysis
- Supplier purchase analysis
- Stock valuation
- Inventory turnover
- Dead/slow-moving stock
- Hourly sales heatmap
- Day/week/month comparisons
- Exportable detailed datasets
- Optional dashboard charts

#### 8. GST / tax compliance reporting

The POS already stores tax rates and store GST information, but a dedicated compliance/reporting layer is not yet present.

Potential scope:

- Taxable value by rate
- CGST/SGST/IGST breakup where applicable
- HSN/SAC support if required
- GST-period reports
- Tax-inclusive/exclusive configuration
- Credit/refund treatment
- Export format suitable for accounting workflows

This should be designed around the actual business's accounting requirements before implementation.

#### 9. Supplier and purchasing expansion

Purchases currently cover the core supplier and incoming-stock workflow. Production expansion can add:

- Purchase returns
- Supplier payment tracking
- Outstanding supplier balances
- Purchase-order workflow
- Expected delivery dates
- Cost-history analysis
- Supplier performance
- Purchase approval states

#### 10. Inventory expansion

The inventory foundation is implemented. Remaining advanced inventory features include:

- Batch/lot tracking
- Expiry dates and shelf life
- Stock transfer between counters/locations
- Stocktake/count sessions
- Variance approval
- Barcode generation/printing beyond current labels
- Product bundles/composite products
- Multiple units of measure
- Weighted barcode support where required
- Purchase-cost history
- Automatic reorder suggestions

The existing `transfer.js` and related foundations should be reviewed before duplicating functionality.

---

### C. Customer and retail engagement work

#### 11. Customer insights

Customers currently provide directory and purchase-history information. A fuller CRM layer could add:

- Customer segmentation
- New vs returning customers
- Visit frequency
- Average order value trends
- Last-purchase reminders
- Favorite products/categories
- Churn/inactivity indicators
- Birthday/anniversary fields if the business wants them

#### 12. Offers and promotions

Not yet a dedicated module. Potential scope:

- Percentage/amount discounts
- Product-level promotions
- Buy X Get Y
- Category promotions
- Time-based offers
- Coupon codes
- Loyalty-member offers
- Promotion validity and usage limits

Promotion rules should be evaluated by the same pricing engine used by checkout so receipts and reports remain consistent.

---

### D. Operational / future feature candidates

These are not required to complete the current core POS but are natural later phases:

- Delivery slots / delivery orders
- ETA/ETD tracking
- Today's menu / scheduled menu
- Recipe management
- Nutritional information
- Customer complaints and returns case management
- Voice search
- Smart notifications/push notifications
- Multi-language UI
- Multi-store / branch management
- Central admin dashboard
- Subscription/licensing system
- Cloud user administration
- Advanced performance monitoring

These should be implemented only after the core transaction, sync and authentication layers are production-stable.

---

## Production-hardening audit

### Data and sync

The existing architecture already has several strong foundations:

- IndexedDB local storage
- Offline outbox/sync in hybrid mode
- Unique `opId` handling
- Google Apps Script locking for server writes
- Device-scoped invoice numbers
- Periodic synchronization
- Local backup support

The next hardening step is to make the newer modules follow the same architecture rather than creating separate local-only stores.

### Performance

The POS keeps data in memory after bootstrap and uses IndexedDB for local persistence. Google Apps Script remains a network boundary, so production performance should avoid fetching entire historical datasets whenever a page needs one record.

Recommended next optimization pass:

- Keep a single in-memory normalized store for all synced datasets.
- Use IndexedDB as the first render source.
- Fetch only changed/new records where possible.
- Add timestamps/version numbers to bootstrap responses.
- Avoid duplicate bootstrap requests during navigation.
- Debounce repeated refresh requests.
- Keep page rendering independent of the network once local data exists.
- Move large historical searches to server-side query actions.
- Add measurable navigation/fetch timings to the Performance module.

The navigation layer already contains a navigation sequence guard so stale asynchronous page loads do not replace a newer route. That pattern should remain mandatory for future modules.

### Caching / PWA

`sw.js` provides application-shell caching and must be version-bumped whenever files under `public/pos` change. Future updates should also verify that new module assets are included in the precache list and that old service-worker caches are removed cleanly.

### Error handling

Future modules should follow the existing application standards:

- Never attach an event handler to an element without checking it exists.
- Do not let an optional UI element failure crash the whole page.
- Guard async navigation against stale results.
- Keep data writes idempotent.
- Display recoverable sync errors without losing local data.
- Keep modal Cancel/Close controls functional and consistently wired.
- Test empty, loading, offline and error states for every module.

---

## Google Sheets backend

The main Apps Script backend is `public/pos/apps-script/Code.gs`.

### Core Sheets

The main backend currently manages:

- `Products`
- `Sales`
- `SaleItems`
- `StockMovements`
- `Settings`
- `SyncLog`

### Procurement extension

`public/pos/apps-script/Procurement.gs` adds:

- `Suppliers`
- `Purchases`
- `PurchaseItems`
- `ProcurementSyncLog`

### Returns extension

`public/pos/apps-script/Returns.gs` adds:

- `Returns`
- `ReturnItems`
- `ReturnsSyncLog`

Cash Drawer, Day Close, Audit Log and Loyalty do not yet have equivalent central Sheets schemas in the current backend and therefore remain local operational stores. This is one of the main remaining production tasks.

---

## File structure

```text
POS-platform-v2/
├── README.md
├── package.json                 Next.js preview-host dependencies/scripts
├── next.config.ts               Preview-host configuration
├── drizzle.config.json          Preview-host Drizzle configuration
├── eslint.config.mjs
├── postcss.config.mjs
├── tsconfig.json
│
├── public/pos/                  ← PRIMARY FRESHMART POS RUNTIME
│   ├── index.html               App shell, navigation and global assets
│   ├── manifest.webmanifest     PWA manifest
│   ├── sw.js                    Service worker / cache version
│   ├── .nojekyll                GitHub Pages support
│   ├── icons/                   PWA icons
│   ├── vendor/                  jsQR and QR-code vendor libraries
│   │
│   ├── css/
│   │   ├── styles.css           Main design system and shared components
│   │   ├── pos-fixes.css        POS-specific visual fixes
│   │   ├── custom-select.css    Select control styling
│   │   ├── procurement.css      Suppliers & Purchases
│   │   ├── returns.css          Returns & Exchanges
│   │   ├── low-stock.css        Low Stock
│   │   ├── reports.css          Reports
│   │   ├── cash-drawer.css      Cash Drawer
│   │   ├── eod-closing.css      Day Close
│   │   ├── audit-log.css        Audit Log
│   │   └── loyalty.css          Loyalty
│   │
│   ├── js/
│   │   ├── app.js               Router, shell, navigation guards and sync status
│   │   ├── dashboard.js         Dashboard
│   │   ├── pos.js               POS / Billing
│   │   ├── inventory.js         Inventory
│   │   ├── labels.js            Product Labels
│   │   ├── sales.js             Invoices / Sales history
│   │   ├── customers.js         Customers
│   │   ├── procurement.js       Suppliers & Purchases
│   │   ├── procurement-router.js Procurement route helpers
│   │   ├── returns-exchanges.js Returns & Exchanges
│   │   ├── cash-drawer.js       Cash Drawer
│   │   ├── eod-closing.js       Day Close
│   │   ├── audit-log.js         Audit Log
│   │   ├── low-stock.js         Low Stock
│   │   ├── reports.js            Reports
│   │   ├── loyalty.js            Loyalty
│   │   ├── settings.js           Settings
│   │   ├── scanner.js            Camera/global scanning
│   │   ├── barcode.js            Barcode helpers
│   │   ├── qr.js                 QR helpers
│   │   ├── receipt.js             Receipt rendering/printing
│   │   ├── ui.js                  Shared UI/modal/toast/icon helpers
│   │   ├── store.js               Shared client state and data access
│   │   ├── analytics.js            Analytics helpers
│   │   ├── performance.js           Performance instrumentation
│   │   ├── pwa.js                  PWA installation/update handling
│   │   ├── media.js                Product-media helpers
│   │   ├── theme.js                Theme/appearance handling
│   │   ├── transfer.js             Stock-transfer foundation
│   │   ├── custom-select.js         Custom select behavior
│   │   └── ux-standards.js          Shared UX safeguards/standards
│   │
│   │   └── data/
│   │       ├── backend.js           Storage-mode selector
│   │       ├── local-adapter.js     IndexedDB-only mode
│   │       ├── hybrid-adapter.js    Offline-first + Google Sheets sync
│   │       ├── sheets-adapter.js    Direct Google Sheets transport
│   │       ├── engine.js             Local business logic / sync replay
│   │       ├── logic.js              Shared pricing/business rules
│   │       ├── idb.js                IndexedDB wrapper
│   │       ├── folder-backup.js      PC folder backup
│   │       └── sample.js              Demo data
│   │
│   └── apps-script/
│       ├── Code.gs                  Core Google Sheets backend
│       ├── Procurement.gs           Supplier/purchase backend extension
│       ├── ProcurementDemoSeed.gs   Procurement demo seed data
│       └── Returns.gs               Returns/exchanges backend extension
│
├── tests/
│   ├── apps-script.test.mjs         Apps Script backend tests
│   ├── gas-mock.mjs                 Google Apps Script mock environment
│   ├── e2e-features.mjs             Browser feature tests
│   ├── e2e-offline.mjs              Offline/PWA tests
│   ├── compat-win7.mjs              Windows 7 browser compatibility tests
│   └── package.json                 Test-only dependencies
│
├── windows-kit/                     Windows 7 local-server package
│
└── src/                             NEXT.JS PREVIEW HOST ONLY
    ├── app/                          Next.js app shell/API/download scaffolding
    ├── db/                           Drizzle/preview database scaffolding
    └── lib/                          Preview-host utilities
```

The file structure above reflects the repository audited on **1 October 2026**. New modules should be added to the corresponding `public/pos/js` and `public/pos/css` locations and wired through `app.js` rather than creating a second application architecture.

---

## Running the POS

The POS runtime does not require Next.js, React or a build step.

Any static HTTP server can serve `public/pos` because ES modules do not work reliably from `file://` URLs.

```bash
cd public/pos
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

The app starts in demo/local mode and uses sample data in the browser.

---

## Connecting Google Sheets

1. Create a Google Sheet.
2. Open **Extensions → Apps Script**.
3. Paste the complete contents of `public/pos/apps-script/Code.gs`.
4. If procurement is required, also add `Procurement.gs`.
5. If returns/exchanges are required, also add `Returns.gs`.
6. Save the Apps Script project.
7. Deploy as a **Web app**.
8. Use **Execute as: Me**.
9. Use **Who has access: Anyone** for the current simple deployment model.
10. Copy the `/exec` URL.
11. In FreshMart POS open **Settings → Data storage & sync** and connect the URL.

The backend creates the required core tabs automatically. Procurement and Returns extensions create their own tabs when their bootstrap actions are used.

### Optional API key

`Code.gs` supports a shared `API_KEY`. If enabled, enter the same key in POS Settings.

After changing Apps Script code, deploy a **new version** through **Manage deployments**. Editing the script without redeploying does not update the `/exec` endpoint.

---

## Storage modes

| Mode | Offline | Data location | Recommended use |
|---|---:|---|---|
| **This PC only** | Yes | IndexedDB | Single-terminal demo or standalone use |
| **This PC + Google Sheets** | Yes | IndexedDB + Google Sheets | Recommended normal operation |
| **Google Sheets live** | No | Google Sheets | Strict live-sheet operation |

### Offline-first flow

In hybrid mode:

1. The POS writes to IndexedDB first.
2. A unique `opId` is added to the outbox.
3. The cashier can continue working without waiting for Google Sheets.
4. When online, queued operations are sent to Apps Script.
5. `SyncLog` prevents duplicate application of the same operation.
6. Fresh data is downloaded and merged back into the local state.

The router also guards against stale asynchronous navigation results so a slower page request cannot replace a page the user has already navigated away from.

---

## Backups and PWA

### PWA

The application can be installed from supported Chrome/Edge browsers. The service worker caches the application shell so the POS can start offline.

Whenever a file under `public/pos` is changed:

1. Bump the `VERSION` in `public/pos/sw.js`.
2. Verify the changed assets are included in the service-worker cache list.
3. Run the browser tests.
4. Deploy.

### Backups

The application supports:

- Local IndexedDB storage
- Download/restore data files
- Optional PC folder backup through the File System Access API on supported browsers
- Daily backup copies in the configured backup folder

A future production backup layer should also include scheduled cloud-side Sheet snapshots and restore procedures.

---

## Demo data

The POS includes demo/sample data for development and testing.

The demo environment includes grocery products, prices, tax information and sample sales. Procurement has a separate demo seed script.

Do not treat demo customers, invoices, suppliers or loyalty records as real business data.

---

## Testing

The repository contains both backend and browser-level tests.

### Apps Script tests

```bash
node tests/apps-script.test.mjs
```

### Feature tests

```bash
node tests/e2e-features.mjs
```

### Offline tests

```bash
node tests/e2e-offline.mjs
```

### Windows 7 compatibility

```bash
node tests/compat-win7.mjs
```

Playwright/Chromium is used by the browser-level tests. CI also performs static validation and browser checks.

### Required regression coverage for every new module

Every new module should be checked for:

- Initial load
- Navigation into and out of the page
- Empty state
- Loading state
- Error state
- Offline state where applicable
- Google Sheets sync state where applicable
- Modal open/close/cancel controls
- Search/filter controls
- Scrolling tables and sticky headers
- Mobile/narrow viewport layout
- CSV export where provided
- Refresh after data changes
- Back/forward navigation
- Service-worker asset caching

---

## Development standards

The recent UI regressions demonstrate why new modules must follow the existing component patterns rather than inventing separate page behavior.

### UI standards

- Use the shared `.card`, `.card-head`, `.card-body`, `.btn`, `.input`, `.table` and modal patterns.
- Use the global page title/subtitle in the top bar; do not duplicate long page headings inside modules unless the content genuinely needs one.
- Keep module subtitles short enough that action buttons remain on the same row.
- Use the same spacing scale as existing modules.
- Keep modal Cancel/Close buttons functional.
- Use opaque sticky table headers with an isolated scrolling container.
- Avoid page-specific positioning/z-index hacks unless they solve a documented browser issue.

### Data standards

- Read from local state/IndexedDB first.
- Do not make page navigation wait unnecessarily for a network request when cached data is available.
- Use navigation-generation guards for asynchronous page loads.
- Make writes idempotent.
- Use server-side locking for stock-changing operations.
- Never silently discard failed sync operations.

### Cashier identity

The current demo operator is **Anand Ibrahim / Anand I**, Counter 1. This is not intended to be the final authentication model. Any future staff/authentication implementation must replace hard-coded identity values across receipts, audit records, drawer sessions and day closing.

---

## Recommended next development order

Based on the 1 October 2026 audit, the recommended engineering sequence is:

1. **Fix and regression-test the three sticky-table modules** — Day Close, Audit Log and Loyalty.
2. **Centralize Cash Drawer, Day Close and Audit Log data in Google Sheets with offline sync.**
3. **Complete Loyalty checkout integration and central loyalty ledger.**
4. **Introduce cashier/staff authentication, roles and permissions.**
5. **Harden sync/performance for larger Sheets datasets.**
6. **Complete advanced Reports/GST/profit analytics.**
7. **Add payment-gateway and hardware integrations if required for the target deployment.**
8. **Expand inventory/purchasing/customer/promotions features.**
9. **Only then move into optional delivery, recipe, nutrition, notifications, multilingual and multi-store features.**

This order keeps the transaction and data-consistency foundation ahead of feature expansion and reduces the risk of building more UI on top of local-only implementations that later need to be rewritten.

---

## Deployment notes

### GitHub Pages / static hosting

Upload the contents of `public/pos` to the static host and preserve:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `.nojekyll`
- `icons/`
- `css/`
- `js/`
- `vendor/`
- `apps-script/` only as source/reference; Apps Script itself is deployed separately

### Windows 7

The repository includes `windows-kit/` for the legacy supported browser environment. Use the included local server rather than opening `index.html` directly.

Supported legacy browser targets are documented in the Windows kit and compatibility test.

---

## Important architectural note

The repository contains a Next.js/PostgreSQL/Drizzle scaffold because the original preview environment was generated from that stack. **Do not move the FreshMart POS runtime into that stack unless there is an explicit architectural decision to do so.** The current application deliberately uses `public/pos` with Google Sheets + Apps Script + IndexedDB because that is the deployment model being developed and tested.
