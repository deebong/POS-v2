# FreshMart POS — Public Deployment

**Reviewed:** 21 October 2026  
**Repository role:** production-facing static frontend repository. This is a deployment target, not the authoritative source repository.

- **Public site:** https://deebong.github.io/POS-v2/
- **Authoritative source:** https://github.com/deebong/POS-platform-v2
- **Acceptance/staging site:** https://deebong.github.io/POS-v2-staging/

## Deployment status

This repository has previously been updated by an automated publish workflow after a push to the private source repository's `main` branch. That publication was an automated deployment event; it should not be interpreted as explicit release approval or proof that all live acceptance checks passed.

**Do not make ordinary feature fixes directly in this repository.** Make changes in `POS-platform-v2`, run CI, deploy and test a candidate in `POS-v2-staging`, and publish here only after an explicit production release decision. A green workflow alone is not a production sign-off.

## What this application is

FreshMart POS is a static HTML/CSS/JavaScript PWA. Its local-first architecture uses IndexedDB and can connect to Google Sheets through Google Apps Script. The public frontend is not itself the Apps Script backend; the backend URL and deployment version configured by the operator determine which Sheet receives data.

Do not configure this production-facing site with disposable test credentials or use it to test destructive workflows.

## Modules present in the deployed frontend

The frontend contains code/UI for Dashboard, POS/Billing, Inventory, Product Labels, Invoices/Sales, Customers, Suppliers/Purchases, Returns/Exchanges, Cash Drawer, Day Close, Audit Log, Low Stock, Reports, Loyalty, Staff & Users, Settings, GST bill/export, barcode/QR scanning helpers and PWA/offline support.

**Code present does not mean fully verified.** Known limitations in the documented implementation include:

- Cash Drawer, Day Close, Audit Log and parts of Loyalty are local operational stores; complete central Sheets persistence is not established.
- Loyalty checkout earning/redemption/reversal and a central ledger remain incomplete.
- Server-authoritative staff/session enforcement and full multi-store/multi-counter isolation are not certified.
- Cash/card/UPI tender options are not equivalent to live payment gateway integrations.
- Browser printing/scanning does not guarantee compatibility with thermal printers, ESC/POS, weighing machines, physical cash drawers or every scanner.
- Settings persistence, role switching/navigation refresh, live returns and stock effects, backup/restore, Tamil output, receipt/GST export and target-device PWA behavior require acceptance evidence.

Consult the [source regression and release log](https://github.com/deebong/POS-platform-v2/blob/main/docs/REGRESSION-AND-RELEASE-LOG.md) for the current known issues and their recorded verification status.

## Planned roadmap retained

The wider product roadmap includes multiple payment gateways and UPI IDs; delivery/logistics; finance and expense tracking; thermal printers, barcode/QR scanners and weighing-machine integration; client- and industry-specific dashboard themes; a guided setup for non-technical founders; optional plugins; grocery product-image tooling; Tally migration; ERP/accounting and other-app integrations; multi-store functionality; and additional industry-specific workflows.

These are future/extended capabilities unless the source code and acceptance record explicitly confirm otherwise.

## Data and safety

- Do not store credentials, setup codes, private deployment URLs or customer data in this README.
- Do not use this public production site for disposable-Sheet acceptance testing.
- Before a production release, record the source commit, public deployment commit, workflow run and acceptance evidence.
- If a production issue is found, reproduce/fix it in the private source repository and validate the fix in staging before republishing.

## Source structure

The authoritative file tree, installation notes, current module classifications and retained feature roadmap are maintained in the [private source README](https://github.com/deebong/POS-platform-v2/blob/main/README.md). This repository contains the deployed static frontend assets; do not treat its contents as the source of truth for development.
