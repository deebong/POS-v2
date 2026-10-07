/**
 * FreshMart POS — Google Sheets backend (Google Apps Script)
 * ===========================================================
 * This script turns a Google Sheet into the database + API for the POS web app.
 *
 * SETUP (2 minutes)
 *  1. Create a new Google Sheet (any name).
 *  2. Extensions ▸ Apps Script. Delete the sample code, paste THIS WHOLE FILE, click Save.
 *  3. Deploy ▸ New deployment ▸ gear icon ▸ "Web app"
 *        Execute as:        Me
 *        Who has access:    Anyone
 *  4. Click Deploy, authorise when asked, then copy the "Web app URL" (ends in /exec).
 *  5. In the POS app: Settings ▸ Data source ▸ paste the URL ▸ Connect.
 *
 * The tabs Products, Sales, SaleItems, StockMovements and Settings are created automatically.
 * You can open them any time to view, filter, chart or (carefully) edit your data.
 *
 * AFTER EDITING THIS CODE: Deploy ▸ Manage deployments ▸ pencil ▸ Version: "New version" ▸ Deploy.
 *
 * OFFLINE MODE: in "This PC + Google Sheets" mode the POS works without internet and later sends its
 * queued changes through the `syncBatch` action. Every change carries a unique opId that is recorded in
 * the SyncLog tab, so a change is never applied twice even if the connection drops mid-sync.
 *
 * PHOTOS: product photos chosen in the POS are saved to a Drive folder "FreshMart POS Images" (shared
 * as "anyone with the link") and the link is stored in the Products tab. The first time, Google asks you
 * to allow Drive access. If a photo upload says "authorization required", open this script, pick the
 * function `authorize` in the toolbar, click Run once and allow access.
 *
 * SECURITY: "Anyone" means anyone who knows the long, secret URL can call it. For extra protection
 * set API_KEY below and enter the same key in the POS Settings.
 */

var API_KEY = ''; // optional shared secret, e.g. 'my-store-key-123'
var SPREADSHEET_ID = ''; // leave empty when the script is opened from the sheet (Extensions ▸ Apps Script)
var VERSION = '1.6.0';
var MAX_CART_LINES = 150;

// Column schema: [name, type]  n = number, s = text, b = true/false, d = date-time
var SCHEMA = {
  Products: [['id', 'n'], ['sku', 's'], ['barcode', 's'], ['name', 's'], ['category', 's'], ['emoji', 's'], ['unit', 's'],
    ['price', 'n'], ['cost', 'n'], ['taxRate', 'n'], ['stock', 'n'], ['reorderLevel', 'n'], ['isActive', 'b'],
    ['createdAt', 'd'], ['updatedAt', 'd'], ['imageUrl', 's']],
  Sales: [['id', 'n'], ['invoiceNo', 's'], ['createdAt', 'd'], ['customerName', 's'], ['customerPhone', 's'], ['customerAddress', 's'],
    ['subtotal', 'n'], ['discount', 'n'], ['tax', 'n'], ['total', 'n'], ['paymentMethod', 's'], ['amountPaid', 'n'],
    ['changeDue', 'n'], ['status', 's'], ['note', 's'], ['voidedAt', 'd'], ['clientRef', 's']],
  SaleItems: [['id', 'n'], ['saleId', 'n'], ['invoiceNo', 's'], ['productId', 'n'], ['sku', 's'], ['name', 's'],
    ['emoji', 's'], ['unit', 's'], ['price', 'n'], ['cost', 'n'], ['qty', 'n'], ['taxRate', 'n'], ['lineSubtotal', 'n'], ['lineTax', 'n']],
  StockMovements: [['id', 'n'], ['createdAt', 'd'], ['productId', 'n'], ['sku', 's'], ['name', 's'], ['change', 'n'],
    ['reason', 's'], ['reference', 's']],
  Settings: [['key', 's'], ['value', 's']],
  Staff: [['id', 's'], ['name', 's'], ['username', 's'], ['phone', 's'], ['role', 's'], ['active', 'b'], ['pinSalt', 's'], ['pinHash', 's'], ['pinIterations', 'n'], ['mustChangePin', 'b'], ['createdAt', 'd'], ['updatedAt', 'd'], ['lastLoginAt', 'd'], ['failedAttempts', 'n'], ['lockedUntil', 'd']],
  AuthSessions: [['tokenHash', 's'], ['staffId', 's'], ['createdAt', 'd'], ['expiresAt', 'd'], ['lastSeenAt', 'd'], ['deviceId', 's'], ['revoked', 'b']],
  AuditLog: [['id', 's'], ['at', 'd'], ['actorId', 's'], ['actorName', 's'], ['role', 's'], ['deviceId', 's'], ['action', 's'], ['module', 's'], ['detail', 's'], ['entity', 's'], ['level', 's'], ['prevHash', 's'], ['hash', 's']],
  SyncLog: [['opId', 's'], ['appliedAt', 'd'], ['deviceId', 's'], ['type', 's'], ['ok', 'b'], ['message', 's']],
  Customers: [['id', 's'], ['name', 's'], ['phone', 's'], ['email', 's'], ['address', 's'], ['notes', 's'], ['createdAt', 'd'], ['updatedAt', 'd'], ['active', 'b']]
};
var SETTING_KEYS = ['storeName', 'address', 'phone', 'phoneNumbers', 'language', 'taxId', 'currency', 'taxLabel', 'upiId', 'upiIds', 'upiQrUrl', 'receiptCustomerName', 'receiptCustomerPhone', 'brandTagline', 'receiptFooter',
  'themeColor', 'themeMode', 'sidebarTheme', 'productImageMode', 'productLabelCode', 'logoUrl', 'brandLogoMode', 'faviconUrl', 'receiptLogoUrl', 'installationId', 'installationStatus', 'installedAt'];

/* ------------------------------------------------------------------ */
/* HTTP entry points                                                   */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, service: 'FreshMart POS API', version: VERSION, needsKey: !!API_KEY });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (API_KEY && req.key !== API_KEY) throw new Error('Invalid access key');
    var handler = ACTIONS[req.action];
    if (!handler) throw new Error('Unknown action: ' + req.action);
    var actor = requireActionAuth_(req);
    out = handler(req);
    if (actor) out.actor = { id: actor.id, name: actor.name, username: actor.username, role: actor.role };
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var ACTIONS = {
  ping: ping_,
  bootstrap: bootstrap_,
  authChallenge: authChallenge_,
  authLogin: authLogin_,
  authLogout: authLogout_,
  authSyncStaff: authSyncStaff_,
  authStatus: authStatus_,
  installationStatus: installationStatus_,
  initialize: initializeInstallation_,
  auditAppend: auditAppend_,
  saveProduct: function (r) { return withLock_(function () { return saveProduct_(r); }); },
  deleteProduct: function (r) { return withLock_(function () { return deleteProduct_(r); }); },
  adjustStock: function (r) { return withLock_(function () { return adjustStock_(r); }); },
  importProducts: function (r) { return withLock_(function () { return importProducts_(r); }); },
  checkout: function (r) { return withLock_(function () { return checkout_(r); }); },
  voidSale: function (r) { return withLock_(function () { return voidSale_(r); }); },
  getSale: getSale_,
  saveCustomer: function (r) { return withLock_(function () { return saveCustomer_(r); }); },
  saveSettings: function (r) { return withLock_(function () { return saveSettings_(r); }); },
  syncBatch: function (r) { return withLock_(function () { return syncBatch_(r); }); },
  importBulk: function (r) { return withLock_(function () { return importBulk_(r); }); },
  uploadImage: uploadImage_,
  backupStatus: backupStatus_,
  backupSetup: backupSetup_,
  backupNow: backupNow_,
  backupVerify: backupVerify_,
  backupRestore: backupRestore_,
  procurementBootstrap: procurementBootstrap_,
  procurementSync: function (r) { return withLock_(function () { return procurementSync_(r); }); }
};

/* ------------------------------------------------------------------ */
/* Staff authentication and server-side authorization                  */
/* ------------------------------------------------------------------ */
var AUTH_SESSION_MS = 12 * 60 * 60 * 1000;
// Keep an authenticated POS counter usable through normal quiet periods. The absolute
// session lifetime remains 12 hours; background sync requests refresh lastSeenAt.
var AUTH_IDLE_MS = 12 * 60 * 60 * 1000;
var AUTH_MAX_FAILED = 5;
var AUTH_LOCK_MS = 15 * 60 * 1000;

function authNow_() { return new Date(); }
function authHex_(bytes) {
  return bytes.map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('');
}
function authSha_(value) { return authHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)); }
function authSetupCode_() {
  var props = PropertiesService.getScriptProperties();
  var code = props.getProperty('AUTH_SETUP_CODE');
  if (!code) { code = Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase(); props.setProperty('AUTH_SETUP_CODE', code); }
  return code;
}

function installationStatus_() {
  var settings = settingsMap_();
  var rows = staffRows_();
  var installed = String(settings.installationStatus || '').toLowerCase() === 'installed' || rows.length > 0;
  return {
    installed: installed,
    installationId: settings.installationId || '',
    installedAt: settings.installedAt || '',
    storeName: settings.storeName || '',
    language: settings.language || 'en',
    mode: settings.databaseMode || ''
  };
}

function initializeInstallation_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var existingSettings = settingsMap_();
    var rows = staffRows_();
    if (String(existingSettings.installationStatus || '').toLowerCase() === 'installed' || rows.length) {
      throw new Error('This POS backend is already installed. Use the existing staff login.');
    }
    var installation = req.installation || {}, admin = req.admin || {}, input = req.settings || {};
    if (!installation.id || !admin.id || !admin.name || !admin.username || !admin.pinSalt || !admin.pinHash) throw new Error('Installation details are incomplete.');
    if (String(req.setupCode || '') !== authSetupCode_()) throw new Error('Invalid one-time setup code. Generate it with getAuthSetupCode() in the Apps Script editor.');
    if (!['admin'].includes(String(admin.role || ''))) throw new Error('The first account must be a Super Admin.');
    var username = str_(admin.username, 60).toLowerCase();
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) throw new Error('Use 3–60 letters, numbers, dots, underscores or hyphens for the Super Admin username.');
    var now = authNow_().toISOString();
    var staff = {
      id: String(admin.id), name: str_(admin.name, 80), username: username, phone: str_(admin.phone, 30),
      role: 'admin', active: true, pinSalt: str_(admin.pinSalt, 200), pinHash: str_(admin.pinHash, 200),
      pinIterations: Number(admin.pinIterations) || 120000, mustChangePin: false, createdAt: now, updatedAt: now,
      lastLoginAt: null, failedAttempts: 0, lockedUntil: null
    };
    appendRows_('Staff', [staff]);
    var merged = Object.assign({}, input, {
      installationId: String(installation.id),
      installationStatus: 'installed',
      installedAt: now,
      databaseMode: str_(installation.mode, 30)
    });
    var existing = {}; readTable_('Settings').forEach(function (r) { existing[r.key] = r._row; });
    var list = [];
    SETTING_KEYS.forEach(function (k) {
      if (typeof merged[k] !== 'string') return;
      var v = merged[k].trim().substring(0, 300);
      if (existing[k]) writeRow_('Settings', existing[k], { key: k, value: v });
      else list.push({ key: k, value: v });
    });
    appendRows_('Settings', list);
    PropertiesService.getScriptProperties().setProperty('AUTH_ENFORCED', 'true');
    return { installed: true, installationId: installation.id, installedAt: now, staff: { id: staff.id, name: staff.name, username: staff.username, role: staff.role } };
  } finally {
    lock.releaseLock();
  }
}
// Run once in the Apps Script editor during production setup. The returned code is the one-time
// bootstrap secret used by the POS Staff page to provision the existing local staff accounts.
function getAuthSetupCode() {
  var code = authSetupCode_();
  console.log('AUTH SETUP CODE: ' + code);
  return code;
}

// Authentication must not run the full schema/migration sweep. The POS is offline-first,
// so a slow or busy non-auth sheet must never block the operator from signing in.
function staffRows_() { return readTable_('Staff'); }
function authSession_(token) {
  if (!token) return null;
  var hash = authSha_(token), rows = readTable_('AuthSessions'), now = Date.now(), found = null;
  rows.forEach(function (r) {
    if (r.tokenHash === hash && !r.revoked) {
      var exp = new Date(r.expiresAt || 0).getTime(), idle = new Date(r.lastSeenAt || r.createdAt || 0).getTime();
      if (exp > now && now - idle < AUTH_IDLE_MS) found = r;
    }
  });
  if (!found) return null;
  var users = staffRows_(), user = users.find(function (u) { return u.id === found.staffId && u.active; });
  if (!user) return null;
  found.lastSeenAt = authNow_().toISOString();
  writeRow_('AuthSessions', found._row, found);
  return user;
}

function authRequireRole_(req, minRole) {
  var roleRank = { cashier: 1, manager: 2, admin: 3 };
  var user = authSession_(String(req.authToken || ''));
  if (!user) throw new Error('Authentication required or session expired. Sign in again.');
  if ((roleRank[user.role] || 0) < (roleRank[minRole] || 99)) throw new Error('This action requires ' + minRole + ' access.');
  return user;
}

function requireActionAuth_(req) {
  if (PropertiesService.getScriptProperties().getProperty('AUTH_ENFORCED') !== 'true') return null;
  var action = String(req.action || '');
  var roles = {
    saveProduct: 'manager', deleteProduct: 'manager', adjustStock: 'manager', importProducts: 'manager',
    checkout: 'cashier', voidSale: 'manager', saveSettings: 'admin', importBulk: 'manager',
    uploadImage: 'manager', saveCustomer: 'cashier', backupSetup: 'admin', backupNow: 'admin', backupVerify: 'admin',
    procurementSync: 'manager'
  };
  if (action === 'installationStatus' || action === 'initialize') return null;
  if (action === 'auditAppend') return authRequireRole_(req, 'cashier');
  if (action === 'authDevices' || action === 'authRevokeDevice') return authRequireRole_(req, 'admin');
  if (action === 'syncBatch') {
    var ops = Array.isArray(req.ops) ? req.ops : [];
    var sensitive = ops.some(function (op) { return /^(product\.|stock\.|settings\.|procurement\.)/.test(String(op && op.type || '')); });
    return authRequireRole_(req, sensitive ? 'manager' : 'cashier');
  }
  if (roles[action]) return authRequireRole_(req, roles[action]);
  return null;
}

function authChallenge_(req) {
  var username = str_(req.username, 60).toLowerCase();
  var user = staffRows_().find(function (u) { return u.username.toLowerCase() === username; });
  if (!user || !user.active) throw new Error('Invalid username or PIN.');
  if (user.lockedUntil) {
    var lockUntil = new Date(user.lockedUntil).getTime();
    if (lockUntil > Date.now()) {
      var remainingMinutes = Math.max(1, Math.ceil((lockUntil - Date.now()) / 60000));
      throw new Error('This account is temporarily locked. Try again in ' + remainingMinutes + ' minute' + (remainingMinutes === 1 ? '' : 's') + '.');
    }
    // A previous lock has expired. Clear stale lock state before evaluating the PIN.
    user.failedAttempts = 0;
    user.lockedUntil = null;
    writeRow_('Staff', user._row, user);
  }
  var nonce = Utilities.getUuid() + Utilities.getUuid();
  return { staffId: user.id, username: user.username, name: user.name, role: user.role, pinSalt: user.pinSalt, pinIterations: Number(user.pinIterations) || 120000, nonce: nonce };
}

function authDeviceKey_(deviceId) { return 'AUTH_REVOKED_DEVICE_' + authSha_(str_(deviceId, 120)); }

function authDevices_() {
  var rows = readTable_('AuthSessions'), users = staffRows_(), byId = {};
  users.forEach(function (u) { byId[u.id] = u; });
  var seen = {};
  rows.forEach(function (r) {
    if (!r.deviceId || seen[r.deviceId]) return;
    seen[r.deviceId] = { deviceId: r.deviceId, staffId: r.staffId, staffName: byId[r.staffId] ? byId[r.staffId].name : '', lastSeenAt: r.lastSeenAt, revoked: !!r.revoked || PropertiesService.getScriptProperties().getProperty(authDeviceKey_(r.deviceId)) === 'true' };
  });
  return { devices: Object.keys(seen).map(function (k) { return seen[k]; }) };
}

function authRevokeDevice_(req) {
  var deviceId = str_(req.deviceId, 120);
  if (!deviceId) throw new Error('Device ID is required.');
  PropertiesService.getScriptProperties().setProperty(authDeviceKey_(deviceId), 'true');
  readTable_('AuthSessions').forEach(function (r) {
    if (r.deviceId === deviceId && !r.revoked) { r.revoked = true; writeRow_('AuthSessions', r._row, r); }
  });
  return { deviceId: deviceId, revoked: true };
}

function authLogin_(req) {
  var rows = staffRows_(), username = str_(req.username, 60).toLowerCase();
  var user = rows.find(function (u) { return u.username.toLowerCase() === username; });
  if (!user || !user.active) throw new Error('Invalid username or PIN.');
  if (PropertiesService.getScriptProperties().getProperty(authDeviceKey_(str_(req.deviceId, 120))) === 'true') throw new Error('This device has been revoked. Contact an administrator.');
  if (user.lockedUntil) {
    var lockUntil = new Date(user.lockedUntil).getTime();
    if (lockUntil > Date.now()) {
      var remainingMinutes = Math.max(1, Math.ceil((lockUntil - Date.now()) / 60000));
      throw new Error('This account is temporarily locked. Try again in ' + remainingMinutes + ' minute' + (remainingMinutes === 1 ? '' : 's') + '.');
    }
    user.failedAttempts = 0;
    user.lockedUntil = null;
    writeRow_('Staff', user._row, user);
  }
  var expected = authSha_(String(user.pinHash) + ':' + String(req.nonce || ''));
  if (!req.response || expected !== String(req.response)) {
    user.failedAttempts = Number(user.failedAttempts) + 1;
    if (user.failedAttempts >= AUTH_MAX_FAILED) { user.lockedUntil = new Date(Date.now() + AUTH_LOCK_MS).toISOString(); user.failedAttempts = 0; }
    writeRow_('Staff', user._row, user);
    throw new Error('Invalid username or PIN.');
  }
  user.failedAttempts = 0; user.lockedUntil = null; user.lastLoginAt = authNow_().toISOString(); user.updatedAt = authNow_().toISOString();
  writeRow_('Staff', user._row, user);
  var token = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
  var session = { tokenHash: authSha_(token), staffId: user.id, createdAt: authNow_().toISOString(), expiresAt: new Date(Date.now() + AUTH_SESSION_MS).toISOString(), lastSeenAt: authNow_().toISOString(), deviceId: str_(req.deviceId, 120), revoked: false };
  appendRows_('AuthSessions', [session]);
  return { token: token, expiresAt: session.expiresAt, staff: { id: user.id, name: user.name, username: user.username, role: user.role, mustChangePin: !!user.mustChangePin } };
}

function authLogout_(req) {
  var tokenHash = authSha_(String(req.authToken || '')), rows = readTable_('AuthSessions');
  rows.forEach(function (r) { if (r.tokenHash === tokenHash) { r.revoked = true; writeRow_('AuthSessions', r._row, r); } });
  return { loggedOut: true };
}

function authSyncStaff_(req) {
  var rows = staffRows_(), incoming = Array.isArray(req.users) ? req.users.slice(0, 100) : [];
  if (!incoming.length) throw new Error('No staff accounts supplied.');
  var setupCode = String(req.setupCode || '').trim();
  var setupCodeValid = !!setupCode && setupCode === authSetupCode_();
  // Explicit recovery credential: allow a valid setup code to reconcile the
  // server Staff sheet even when it already contains stale staff records.
  if (!rows.length) {
    if (!setupCodeValid) throw new Error('Server authentication is not initialized. Enter the one-time setup code generated by getAuthSetupCode().');
  } else if (!setupCodeValid) {
    authRequireRole_(req, 'admin');
  }
  var byId = {}, byUser = {}, byRow = {}, updates = {}, newRows = [];
  rows.forEach(function (r) { byId[r.id] = r; byUser[r.username.toLowerCase()] = r; byRow[r._row] = r; });
  var now = authNow_().toISOString();
  incoming.forEach(function (u) {
    if (!u.id || !u.username || !u.pinHash || !u.pinSalt) throw new Error('Each staff account must include its salted PIN verifier.');
    var existing = byId[u.id] || byUser[String(u.username).toLowerCase()];
    var data = {
      id: String(u.id), name: str_(u.name, 80), username: str_(u.username, 60).toLowerCase(), phone: str_(u.phone, 30),
      role: ['admin','manager','cashier'].indexOf(u.role) >= 0 ? u.role : 'cashier', active: u.active !== false,
      pinSalt: str_(u.pinSalt, 200), pinHash: str_(u.pinHash, 200), pinIterations: Number(u.pinIterations) || 120000,
      mustChangePin: !!u.mustChangePin, createdAt: existing ? existing.createdAt : now, updatedAt: now,
      lastLoginAt: existing ? existing.lastLoginAt : null,
      failedAttempts: setupCodeValid ? 0 : (existing ? Number(existing.failedAttempts) || 0 : 0),
      lockedUntil: setupCodeValid ? null : (existing ? existing.lockedUntil : null)
    };
    if (existing && existing.id !== data.id) throw new Error('Username is already assigned to another staff account.');
    if (existing) updates[existing._row] = data; else newRows.push(data);
  });

  // Batch existing-row updates into one SpreadsheetApp call. Staff changes happen
  // frequently enough that one write per user makes Apps Script web requests unnecessarily slow.
  var updateRows = Object.keys(updates).map(Number).sort(function (a, b) { return a - b; });
  if (updateRows.length) {
    var minRow = updateRows[0], maxRow = updateRows[updateRows.length - 1], matrix = [];
    for (var rowNo = minRow; rowNo <= maxRow; rowNo++) {
      matrix.push(objToRow_('Staff', updates[rowNo] || byRow[rowNo]));
    }
    sheet_('Staff').getRange(minRow, 1, matrix.length, SCHEMA.Staff.length).setValues(matrix);
  }
  appendRows_('Staff', newRows);

  PropertiesService.getScriptProperties().setProperty('AUTH_ENFORCED', 'true');
  if (setupCodeValid) PropertiesService.getScriptProperties().deleteProperty('AUTH_SETUP_CODE');
  return { count: incoming.length, staff: incoming.map(function (u) {
    return { id: String(u.id), name: str_(u.name, 80), username: str_(u.username, 60).toLowerCase(),
      role: ['admin','manager','cashier'].indexOf(u.role) >= 0 ? u.role : 'cashier',
      active: u.active !== false, mustChangePin: !!u.mustChangePin };
  }) };
}

function authStatus_() {
  var rows = staffRows_();
  return { initialized: rows.length > 0, staffCount: rows.length, setupRequired: rows.length === 0 };
}


// Serialise writes so two counters can never sell the same last item.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                       */
/* ------------------------------------------------------------------ */

function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function tz_() { return ss_().getSpreadsheetTimeZone() || 'UTC'; }

function ensureAll_() {
  var ss = ss_();
  var props = PropertiesService.getScriptProperties();
  var migrationKey = 'SCHEMA_MIGRATION_VERSION';
  var needsMigration = props.getProperty(migrationKey) !== VERSION;
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      setupSheet_(ss, name);
    } else if (needsMigration) {
      ensureHeaders_(sh, name);
    }
  });
  if (needsMigration) props.setProperty(migrationKey, VERSION);
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function setupSheet_(ss, name) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var cols = SCHEMA[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length)
      .setValues([cols.map(function (c) { return c[0]; })])
      .setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    var rows = Math.max(sh.getMaxRows() - 1, 1);
    cols.forEach(function (c, i) {
      var rng = sh.getRange(2, i + 1, rows, 1);
      if (c[1] === 's') rng.setNumberFormat('@'); // keep SKUs / barcodes / phones as text
      else if (c[1] === 'd') rng.setNumberFormat('yyyy-mm-dd hh:mm:ss');
    });
  }
  return sh;
}

// Sheets created by an older version get any new columns (e.g. imageUrl) added at the end.
function ensureHeaders_(sh, name) {
  var cols = SCHEMA[name];
  var schemaNames = cols.map(function (c) { return c[0]; });
  var lastCol = Math.max(sh.getLastColumn(), schemaNames.length, 1);
  var lastRow = sh.getLastRow();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v == null ? '' : v).trim(); });

  // New sheets: create the exact schema in the correct order.
  var hasAnyHeader = headers.some(function (h) { return !!h; });
  if (!hasAnyHeader) {
    sh.getRange(1, 1, 1, schemaNames.length)
      .setValues([schemaNames])
      .setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    formatSchemaColumns_(sh, cols);
    return;
  }

  // Legacy sheets can have new columns inserted in the middle of the schema.
  // Never trust column position: rebuild known columns by their header names and
  // keep any unknown legacy columns at the end so no user data is discarded.
  var positions = {};
  headers.forEach(function (h, i) {
    if (h && positions[h] === undefined) positions[h] = i;
  });
  var ordered = schemaNames.slice();
  headers.forEach(function (h) {
    if (h && ordered.indexOf(h) < 0) ordered.push(h);
  });
  var needsReorder = ordered.length !== headers.filter(function (h) { return !!h; }).length;
  for (var i = 0; i < schemaNames.length; i++) {
    if (headers[i] !== schemaNames[i]) { needsReorder = true; break; }
  }

  if (needsReorder) {
    var rows = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    var matrix = [ordered].concat(rows.map(function (row) {
      return ordered.map(function (name) {
        var idx = positions[name];
        return idx === undefined ? '' : row[idx];
      });
    }));
    sh.clearContents();
    sh.getRange(1, 1, matrix.length, ordered.length).setValues(matrix);
    sh.getRange(1, 1, 1, ordered.length)
      .setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else {
    sh.getRange(1, 1, 1, schemaNames.length)
      .setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
  }
}

function formatSchemaColumns_(sh, cols) {
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  cols.forEach(function (c, i) {
    var rng = sh.getRange(2, i + 1, rows, 1);
    if (c[1] === 's') rng.setNumberFormat('@');
    else if (c[1] === 'd') rng.setNumberFormat('yyyy-mm-dd hh:mm:ss');
  });
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  return sh || setupSheet_(ss_(), name);
}

function fromCell_(v, type) {
  if (type === 'n') { var n = Number(v); return isFinite(n) ? n : 0; }
  if (type === 'b') return v === true || String(v).toLowerCase() === 'true';
  if (type === 'd') {
    if (v instanceof Date) return v.toISOString();
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

function toCell_(v, type) {
  if (type === 'n') return Number(v) || 0;
  if (type === 'b') return !!v;
  if (type === 'd') return v ? new Date(v) : '';
  return v === null || v === undefined ? '' : String(v);
}

function rowToObj_(cols, row, rowNo) {
  var o = { _row: rowNo };
  for (var j = 0; j < cols.length; j++) o[cols[j][0]] = fromCell_(row[j], cols[j][1]);
  return o;
}

function objToRow_(name, obj) {
  return SCHEMA[name].map(function (c) { return toCell_(obj[c[0]], c[1]); });
}

function readTable_(name) {
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var hasId = cols[0][0] === 'id';
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var o = rowToObj_(cols, values[i], i + 2);
    if (!hasId || (cols[0][1] === 'n' ? o.id > 0 : !!o.id)) out.push(o);
  }
  return out;
}

function readRow_(name, rowNo) {
  var cols = SCHEMA[name];
  var vals = sheet_(name).getRange(rowNo, 1, 1, cols.length).getValues();
  return rowToObj_(cols, vals[0], rowNo);
}

function colIndex_(name, colName) {
  var cols = SCHEMA[name];
  for (var i = 0; i < cols.length; i++) if (cols[i][0] === colName) return i + 1;
  throw new Error('No column ' + colName);
}

// Row numbers whose column equals `value` (reads a single column only).
function findRows_(name, colName, value) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2 || value === '' || value === null || value === undefined) return [];
  var vals = sh.getRange(2, colIndex_(name, colName), last - 1, 1).getValues();
  var rows = [];
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) rows.push(i + 2);
  return rows;
}

function lastId_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  var max = 0;
  for (var i = 0; i < vals.length; i++) { var n = Number(vals[i][0]); if (n > max) max = n; }
  return max;
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var cols = SCHEMA[name].length;
  var start = Math.max(sh.getLastRow(), 1) + 1;
  var need = start + objs.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows() + 200);
  sh.getRange(start, 1, objs.length, cols).setValues(objs.map(function (o) { return objToRow_(name, o); }));
}

function writeRow_(name, rowNo, obj) {
  sheet_(name).getRange(rowNo, 1, 1, SCHEMA[name].length).setValues([objToRow_(name, obj)]);
}

/* ------------------------------------------------------------------ */
/* Shared logic (mirrors public/pos/js/data/logic.js)                  */
/* ------------------------------------------------------------------ */

function r2_(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function r3_(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
function pad_(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function str_(v, max) { return typeof v === 'string' ? v.trim().substring(0, max || 120) : ''; }
function numOr_(v, fb) {
  if (v === '' || v === null || v === undefined) return fb;
  var n = Number(v);
  return isFinite(n) ? n : NaN;
}

function calcTotals_(lines, dType, dValue) {
  var priced = lines.map(function (l) {
    return { price: l.price, qty: l.qty, taxRate: l.taxRate, lineSubtotal: r2_(l.price * l.qty) };
  });
  var subtotal = r2_(priced.reduce(function (s, l) { return s + l.lineSubtotal; }, 0));
  var discount = 0;
  var v = Number(dValue) || 0;
  if (dType === 'percent') discount = r2_(subtotal * Math.min(Math.max(v, 0), 100) / 100);
  else if (dType === 'amount') discount = Math.min(r2_(Math.max(v, 0)), subtotal);
  var ratio = subtotal > 0 ? discount / subtotal : 0;
  priced.forEach(function (l) { l.lineTax = r2_(l.lineSubtotal * (1 - ratio) * (l.taxRate / 100)); });
  var tax = r2_(priced.reduce(function (s, l) { return s + l.lineTax; }, 0));
  return { lines: priced, subtotal: subtotal, discount: discount, tax: tax, total: r2_(subtotal - discount + tax) };
}

function parseProduct_(b) {
  b = b || {};
  var name = str_(b.name, 120);
  if (!name) throw new Error('Product name is required');
  var price = numOr_(b.price, 0), cost = numOr_(b.cost, 0), taxRate = numOr_(b.taxRate, 0);
  var stock = numOr_(b.stock, 0), reorder = numOr_(b.reorderLevel, 10);
  [price, cost, taxRate, stock, reorder].forEach(function (n) {
    if (isNaN(n)) throw new Error('Price, cost, tax, stock and reorder level must be valid numbers');
  });
  if (price < 0 || cost < 0 || stock < 0 || reorder < 0) throw new Error('Numbers cannot be negative');
  if (taxRate < 0 || taxRate > 100) throw new Error('Tax rate must be between 0 and 100');
  var sku = str_(b.sku, 40).toUpperCase();
  if (!sku) sku = 'P-' + new Date().getTime().toString(36).toUpperCase();
  return {
    sku: sku,
    barcode: str_(b.barcode, 40),
    name: name,
    category: str_(b.category, 60) || 'General',
    emoji: str_(b.emoji, 8) || '🛒',
    unit: (str_(b.unit, 12) || 'pc').toLowerCase(),
    price: r2_(price), cost: r2_(cost), taxRate: r2_(taxRate),
    stock: r3_(stock), reorderLevel: r3_(reorder),
    isActive: b.isActive === undefined ? true : !!b.isActive,
    imageUrl: safeImageUrl_(b.imageUrl)
  };
}

function safeImageUrl_(v) {
  var s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  if (s.length <= 50000 && /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+\/=]+$/i.test(s)) return s;
  if (s.length <= 2000 && /^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return '';
}

/* ------------------------------------------------------------------ */
/* Public shapes                                                       */
/* ------------------------------------------------------------------ */

function pubProduct_(p) {
  return {
    id: p.id, sku: p.sku, barcode: p.barcode || null, name: p.name, category: p.category, emoji: p.emoji,
    unit: p.unit, price: p.price, cost: p.cost, taxRate: p.taxRate, stock: p.stock, reorderLevel: p.reorderLevel,
    isActive: p.isActive, createdAt: p.createdAt, updatedAt: p.updatedAt, imageUrl: p.imageUrl || ''
  };
}
function pubSale_(s) {
  return {
    id: s.id, invoiceNo: s.invoiceNo, customerName: s.customerName || null, customerPhone: s.customerPhone || null, customerAddress: s.customerAddress || null,
    subtotal: s.subtotal, discount: s.discount, tax: s.tax, total: s.total, paymentMethod: s.paymentMethod,
    amountPaid: s.amountPaid, changeDue: s.changeDue, status: s.status || 'completed', note: s.note || null,
    createdAt: s.createdAt, voidedAt: s.voidedAt || null
  };
}
function pubItem_(i) {
  return {
    id: i.id, saleId: i.saleId, productId: i.productId || null, name: i.name, sku: i.sku, emoji: i.emoji || '🛒',
    unit: i.unit, price: i.price, cost: i.cost, qty: i.qty, taxRate: i.taxRate, lineSubtotal: i.lineSubtotal, lineTax: i.lineTax
  };
}

function itemsForSale_(saleId) {
  var rows = findRows_('SaleItems', 'saleId', saleId);
  if (!rows.length) return [];
  var cols = SCHEMA.SaleItems;
  var first = rows[0], lastRow = rows[rows.length - 1];
  var vals = sheet_('SaleItems').getRange(first, 1, lastRow - first + 1, cols.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var o = rowToObj_(cols, vals[i], first + i);
    if (o.saleId === Number(saleId)) out.push(o);
  }
  return out;
}

function movement_(id, p, change, reason, reference, iso) {
  return { id: id, createdAt: iso, productId: p.id, sku: p.sku, name: p.name, change: change, reason: reason, reference: reference || '' };
}

function settingsMap_() {
  var map = {};
  readTable_('Settings').forEach(function (r) { if (r.key) map[r.key] = r.value; });
  return map;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function ping_() {
  // Ping also performs the one-time sheet bootstrap/migration because the POS connection
  // flow historically uses this call to prepare a new backend.
  ensureAll_();
  var ss = ss_();
  return { spreadsheetName: ss.getName(), spreadsheetUrl: ss.getUrl(), version: VERSION, features: ['sync', 'bulk', 'images', 'backups'] };
}

function bootstrap_(req) {
  ensureAll_();
  var days = Math.min(Math.max(Number(req.days) || 90, 1), 3650);
  var since = new Date().getTime() - days * 86400000;
  var ss = ss_();

  var sales = readTable_('Sales').filter(function (s) {
    return s.createdAt && new Date(s.createdAt).getTime() >= since;
  });
  var ids = {};
  sales.forEach(function (s) { ids[s.id] = true; });
  var items = readTable_('SaleItems').filter(function (i) { return ids[i.saleId]; });

  return {
    settings: settingsMap_(),
    products: readTable_('Products').map(pubProduct_),
    sales: sales.map(pubSale_),
    saleItems: items.map(pubItem_),
    customers: readTable_('Customers').filter(function (x) { return x.active !== false; }),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    serverTime: new Date().toISOString(),
    version: VERSION,
    appliedOps: req.includeOps ? recentOpIds_(3000) : undefined
  };
}

function saveCustomer_(req) {
  var b = req.customer || {};
  var id = str_(b.id, 80);
  var name = str_(b.name, 100);
  var phone = str_(b.phone, 30);
  var email = str_(b.email, 160);
  var address = str_(b.address, 500);
  var notes = str_(b.notes, 500);
  if (!name && !phone && !email) throw new Error('Customer name, phone or email is required.');
  var rows = readTable_('Customers'), existing = null;
  rows.forEach(function (r) {
    if ((id && String(r.id) === id) || (!id && phone && String(r.phone || '') === phone)) existing = r;
  });
  var now = new Date().toISOString();
  var data = {
    id: existing ? existing.id : (id || Utilities.getUuid()),
    name: name, phone: phone, email: email, address: address, notes: notes,
    createdAt: existing ? existing.createdAt : now, updatedAt: now, active: b.active !== false
  };
  if (existing) writeRow_('Customers', existing._row, data); else appendRows_('Customers', [data]);
  return { customer: data };
}

function assertUnique_(products, data, id) {
  products.forEach(function (p) {
    if (p.id === id) return;
    if (String(p.sku).toLowerCase() === data.sku.toLowerCase()) throw new Error('A product with this SKU already exists');
    if (data.barcode && p.barcode && String(p.barcode).toLowerCase() === data.barcode.toLowerCase()) {
      throw new Error('A product with this barcode already exists');
    }
  });
}

function saveProduct_(req) {
  var b = req.product || {};
  var data = parseProduct_(b);
  var id = Number(b.id) || 0;
  var products = readTable_('Products');
  var iso = new Date().toISOString();
  assertUnique_(products, data, id);

  if (id) {
    var cur = products.filter(function (p) { return p.id === id; })[0];
    if (!cur) throw new Error('Product not found');
    Object.keys(data).forEach(function (k) { if (k !== 'stock') cur[k] = data[k]; }); // stock only via adjustStock
    cur.updatedAt = iso;
    writeRow_('Products', cur._row, cur);
    return { product: pubProduct_(cur) };
  }
  var p = data;
  p.id = lastId_('Products') + 1;
  p.createdAt = iso;
  p.updatedAt = iso;
  appendRows_('Products', [p]);
  if (p.stock > 0) appendRows_('StockMovements', [movement_(lastId_('StockMovements') + 1, p, p.stock, 'initial', 'Opening stock', iso)]);
  return { product: pubProduct_(p) };
}

function importProducts_(req) {
  var list = Array.isArray(req.products) ? req.products : [];
  var products = readTable_('Products');
  var skus = {}, codes = {};
  products.forEach(function (p) {
    skus[String(p.sku).toLowerCase()] = true;
    if (p.barcode) codes[String(p.barcode).toLowerCase()] = true;
  });
  var iso = new Date().toISOString();
  var nextId = lastId_('Products') + 1;
  var created = [], moves = [], skipped = 0;
  var mvId = lastId_('StockMovements');

  list.forEach(function (raw) {
    var data;
    try { data = parseProduct_(raw); } catch (e) { skipped++; return; }
    var sk = data.sku.toLowerCase(), bc = data.barcode ? data.barcode.toLowerCase() : '';
    if (skus[sk] || (bc && codes[bc])) { skipped++; return; }
    skus[sk] = true;
    if (bc) codes[bc] = true;
    data.id = nextId++;
    data.createdAt = iso;
    data.updatedAt = iso;
    created.push(data);
    if (data.stock > 0) moves.push(movement_(++mvId, data, data.stock, 'initial', 'Opening stock', iso));
  });
  appendRows_('Products', created);
  appendRows_('StockMovements', moves);
  return { products: created.map(pubProduct_), skipped: skipped };
}

function deleteProduct_(req) {
  var rows = findRows_('Products', 'id', req.id);
  if (!rows.length) throw new Error('Product not found');
  sheet_('Products').deleteRow(rows[0]);
  return {};
}

function adjustStock_(req) {
  var rows = findRows_('Products', 'id', req.productId);
  if (!rows.length) throw new Error('Product not found');
  var p = readRow_('Products', rows[0]);
  var mode = req.mode === 'remove' || req.mode === 'set' ? req.mode : 'add';
  var qty = Number(req.quantity);
  if (!isFinite(qty) || qty < 0 || (mode !== 'set' && qty === 0)) throw new Error('Enter a valid quantity');
  var before = p.stock;
  var after = mode === 'add' ? before + qty : mode === 'remove' ? before - qty : qty;
  if (after < 0) throw new Error('Stock cannot go below zero');
  var change = r3_(after - before);
  var iso = new Date().toISOString();
  p.stock = r3_(after);
  p.updatedAt = iso;
  writeRow_('Products', p._row, p);
  if (change !== 0) {
    appendRows_('StockMovements', [movement_(lastId_('StockMovements') + 1, p, change,
      mode === 'add' ? 'restock' : 'adjustment', str_(req.reason, 80), iso)]);
  }
  return { product: pubProduct_(p) };
}

function checkout_(req) {
  if (!Array.isArray(req.items) || !req.items.length) throw new Error('Cart is empty');
  if (req.items.length > MAX_CART_LINES) throw new Error('Too many lines in one bill');

  // Idempotency: a retried request (same clientRef) returns the original bill instead of charging twice.
  var ref = str_(req.clientRef, 64);
  if (ref) {
    var dup = findRows_('Sales', 'clientRef', ref);
    if (dup.length) {
      var s0 = readRow_('Sales', dup[0]);
      return { sale: pubSale_(s0), items: itemsForSale_(s0.id).map(pubItem_), products: [], duplicate: true };
    }
  }

  var wanted = {}, order = [];
  req.items.forEach(function (it) {
    var pid = Number(it.productId), q = Number(it.qty);
    if (!(pid > 0) || !isFinite(q) || !(q > 0)) throw new Error('Invalid item in cart');
    if (!(pid in wanted)) { wanted[pid] = 0; order.push(pid); }
    wanted[pid] = r3_(wanted[pid] + q);
  });

  var byId = {};
  readTable_('Products').forEach(function (p) { byId[p.id] = p; });
  var lines = order.map(function (pid) {
    var p = byId[pid], qty = wanted[pid];
    if (!p || !p.isActive) throw new Error('A product in the cart is no longer available');
    if (p.stock < qty) throw new Error('Not enough stock for ' + p.name + ' (available: ' + p.stock + ' ' + p.unit + ')');
    return { p: p, qty: qty };
  });

  var dType = req.discountType === 'percent' || req.discountType === 'amount' ? req.discountType : 'none';
  var calc = calcTotals_(lines.map(function (l) { return { price: l.p.price, qty: l.qty, taxRate: l.p.taxRate }; }), dType, req.discountValue);
  var method = ['cash', 'card', 'upi'].indexOf(req.paymentMethod) >= 0 ? req.paymentMethod : 'cash';
  var paid = method === 'cash' ? Number(req.amountPaid) : calc.total;
  if (!isFinite(paid)) paid = calc.total;
  if (paid + 0.001 < calc.total) throw new Error('Amount received is less than the total due');
  paid = r2_(paid);

  var now = new Date(), iso = now.toISOString();
  var saleId = lastId_('Sales') + 1;
  var invoiceNo = 'INV-' + Utilities.formatDate(now, tz_(), 'yyyyMMdd') + '-' + pad_(saleId, 5);
  var sale = {
    id: saleId, invoiceNo: invoiceNo, createdAt: iso,
    customerName: str_(req.customerName, 80), customerPhone: str_(req.customerPhone, 24), customerAddress: str_(req.customerAddress, 300),
    subtotal: calc.subtotal, discount: calc.discount, tax: calc.tax, total: calc.total,
    paymentMethod: method, amountPaid: paid, changeDue: method === 'cash' ? r2_(paid - calc.total) : 0,
    status: 'completed', note: str_(req.note, 200), voidedAt: null, clientRef: ref
  };
  appendRows_('Sales', [sale]);

  var itemId = lastId_('SaleItems');
  var items = lines.map(function (l, i) {
    return {
      id: ++itemId, saleId: saleId, invoiceNo: invoiceNo, productId: l.p.id, sku: l.p.sku, name: l.p.name,
      emoji: l.p.emoji, unit: l.p.unit, price: l.p.price, cost: l.p.cost, qty: l.qty, taxRate: l.p.taxRate,
      lineSubtotal: calc.lines[i].lineSubtotal, lineTax: calc.lines[i].lineTax
    };
  });
  appendRows_('SaleItems', items);

  var mvId = lastId_('StockMovements');
  var moves = [];
  lines.forEach(function (l) {
    l.p.stock = r3_(l.p.stock - l.qty);
    l.p.updatedAt = iso;
    writeRow_('Products', l.p._row, l.p);
    moves.push(movement_(++mvId, l.p, -l.qty, 'sale', invoiceNo, iso));
  });
  appendRows_('StockMovements', moves);
  SpreadsheetApp.flush();

  return {
    sale: pubSale_(sale),
    items: items.map(pubItem_),
    products: lines.map(function (l) { return pubProduct_(l.p); })
  };
}

function voidSale_(req) {
  var rows = findRows_('Sales', 'id', req.id);
  if (!rows.length) throw new Error('Invoice not found');
  var sale = readRow_('Sales', rows[0]);
  if (sale.status === 'voided') throw new Error('This invoice is already voided');

  var items = itemsForSale_(sale.id);
  var iso = new Date().toISOString();
  var mvId = lastId_('StockMovements');
  var moves = [], touched = [];
  items.forEach(function (it) {
    var prow = findRows_('Products', 'id', it.productId);
    if (!prow.length) return; // product was deleted since
    var p = readRow_('Products', prow[0]);
    p.stock = r3_(p.stock + it.qty);
    p.updatedAt = iso;
    writeRow_('Products', p._row, p);
    moves.push(movement_(++mvId, p, it.qty, 'void', sale.invoiceNo, iso));
    touched.push(p);
  });
  appendRows_('StockMovements', moves);
  sale.status = 'voided';
  sale.voidedAt = iso;
  writeRow_('Sales', sale._row, sale);
  SpreadsheetApp.flush();
  return { sale: pubSale_(sale), items: items.map(pubItem_), products: touched.map(pubProduct_) };
}

function getSale_(req) {
  var rows = req.id ? findRows_('Sales', 'id', req.id) : findRows_('Sales', 'invoiceNo', req.invoiceNo);
  if (!rows.length) return { sale: null, items: [] };
  var s = readRow_('Sales', rows[0]);
  return { sale: pubSale_(s), items: itemsForSale_(s.id).map(pubItem_) };
}

function saveSettings_(req) {
  var input = req.settings || {};
  var existing = {};
  readTable_('Settings').forEach(function (r) { existing[r.key] = r._row; });
  var appendList = [];
  SETTING_KEYS.forEach(function (k) {
    if (typeof input[k] !== 'string') return;
    var v = input[k].trim().substring(0, 300);
    if (existing[k]) writeRow_('Settings', existing[k], { key: k, value: v });
    else appendList.push({ key: k, value: v });
  });
  appendRows_('Settings', appendList);
  return { settings: settingsMap_() };
}

/* ------------------------------------------------------------------ */
/* Offline sync                                                        */
/* ------------------------------------------------------------------ */

function recentOpIds_(limit) {
  var sh = sheet_('SyncLog');
  var last = sh.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - limit + 1);
  return sh.getRange(start, 1, last - start + 1, 1).getValues()
    .map(function (r) { return String(r[0]); })
    .filter(function (v) { return v; });
}

function resolveProduct_(products, id, sku) {
  var n = Number(id), i;
  if (n > 0) for (i = 0; i < products.length; i++) if (products[i].id === n) return products[i];
  if (sku) {
    var k = String(sku).toLowerCase();
    for (i = 0; i < products.length; i++) if (String(products[i].sku).toLowerCase() === k) return products[i];
  }
  return null;
}

// Applies queued operations from a POS device, in order. Already-applied opIds are skipped.
function syncBatch_(req) {
  var ops = Array.isArray(req.ops) ? req.ops.slice(0, 50) : [];
  var device = str_(req.deviceCode || req.deviceId, 40);
  var seen = {};
  readTable_('SyncLog').forEach(function (r) { if (r.opId) seen[r.opId] = r; });
  var results = [];
  ops.forEach(function (op) {
    var id = str_(op && op.opId, 64);
    if (!id) { results.push({ opId: '', ok: false, error: 'Missing opId' }); return; }
    var prev = seen[id];
    if (prev) {
      results.push({ opId: id, ok: prev.ok, duplicate: true, error: prev.ok ? undefined : prev.message });
      return;
    }
    var res;
    try {
      res = applyOp_(op, req) || {};
      res.ok = true;
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }
    res.opId = id;
    // Logged immediately after each op so a timeout mid-batch can't cause a re-apply on retry.
    appendRows_('SyncLog', [{ opId: id, appliedAt: new Date().toISOString(), deviceId: device, type: str_(op.type, 30),
      ok: res.ok, message: res.error || res.warning || '' }]);
    seen[id] = { ok: res.ok, message: res.error || '' };
    results.push(res);
  });
  SpreadsheetApp.flush();
  return { results: results };
}

function applyOp_(op, req) {
  var p = op.payload || {};
  switch (op.type) {
    case 'sale': return recordSale_(p, op.opId);
    case 'void': return syncVoid_(p);
    case 'product.save': return syncProduct_(p);
    case 'product.delete': return syncDeleteProduct_(p);
    case 'stock': return syncStock_(p);
    case 'import':
      var r = importProducts_({ products: p.products || [] });
      return r.skipped ? { warning: r.skipped + ' product(s) skipped — SKU already on the sheet' } : {};
    case 'settings': saveSettings_({ settings: p.settings || {} }); return {};
    case 'customer.save': return saveCustomer_({ customer: p.customer || {} });
    case 'audit': return auditAppend_({ event: p.event || {}, authToken: req.authToken, deviceId: op.deviceId });
    default: throw new Error('Unknown operation: ' + op.type);
  }
}

// A sale made at the till (maybe offline) is a fact: record it as-is, even if stock goes negative.
function recordSale_(p, opId) {
  var s = p.sale || {};
  var items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) throw new Error('Sale has no items');
  if (items.length > MAX_CART_LINES) throw new Error('Too many lines in one bill');
  var ref = str_(s.clientRef, 64) || str_(opId, 64);
  if (findRows_('Sales', 'clientRef', ref).length) return { duplicate: true };

  var now = new Date(), iso = now.toISOString();
  var created = s.createdAt && !isNaN(new Date(s.createdAt).getTime()) ? new Date(s.createdAt).toISOString() : iso;
  var invoiceNo = str_(s.invoiceNo, 40) || ('INV-' + Utilities.formatDate(now, tz_(), 'yyyyMMdd') + '-SYNC');
  var warnings = [];
  if (findRows_('Sales', 'invoiceNo', invoiceNo).length) {
    invoiceNo = invoiceNo + '-' + String(opId).substring(0, 4).toUpperCase();
    warnings.push('Invoice number already existed, saved as ' + invoiceNo);
  }
  var method = ['cash', 'card', 'upi'].indexOf(s.paymentMethod) >= 0 ? s.paymentMethod : 'cash';
  var saleId = lastId_('Sales') + 1;
  var sale = {
    id: saleId, invoiceNo: invoiceNo, createdAt: created,
    customerName: str_(s.customerName, 80), customerPhone: str_(s.customerPhone, 24), customerAddress: str_(s.customerAddress, 300),
    subtotal: r2_(Number(s.subtotal) || 0), discount: r2_(Number(s.discount) || 0), tax: r2_(Number(s.tax) || 0),
    total: r2_(Number(s.total) || 0), paymentMethod: method, amountPaid: r2_(Number(s.amountPaid) || 0),
    changeDue: r2_(Number(s.changeDue) || 0), status: 'completed', note: str_(s.note, 200), voidedAt: null, clientRef: ref
  };
  appendRows_('Sales', [sale]);

  var products = readTable_('Products');
  var itemId = lastId_('SaleItems'), mvId = lastId_('StockMovements');
  var rows = [], moves = [], touched = {};
  items.forEach(function (it) {
    var prod = resolveProduct_(products, it.productId, it.sku);
    var qty = r3_(Number(it.qty) || 0);
    rows.push({
      id: ++itemId, saleId: saleId, invoiceNo: invoiceNo, productId: prod ? prod.id : 0, sku: str_(it.sku, 40),
      name: str_(it.name, 120), emoji: str_(it.emoji, 8), unit: str_(it.unit, 12), price: Number(it.price) || 0, cost: Number(it.cost) || 0, qty: qty,
      taxRate: Number(it.taxRate) || 0, lineSubtotal: Number(it.lineSubtotal) || 0, lineTax: Number(it.lineTax) || 0
    });
    if (!prod) { warnings.push('Unknown product ' + it.sku + ' — stock not updated'); return; }
    prod.stock = r3_(prod.stock - qty);
    prod.updatedAt = iso;
    touched[prod.id] = prod;
    moves.push(movement_(++mvId, prod, -qty, 'sale', invoiceNo, iso));
  });
  appendRows_('SaleItems', rows);
  Object.keys(touched).forEach(function (k) {
    var prod = touched[k];
    writeRow_('Products', prod._row, prod);
    if (prod.stock < 0) warnings.push(prod.name + ' stock is now ' + prod.stock + ' — please recount');
  });
  appendRows_('StockMovements', moves);
  return { saleId: saleId, invoiceNo: invoiceNo, warning: warnings.length ? warnings.join('; ') : undefined };
}

function syncVoid_(p) {
  var rows = findRows_('Sales', 'invoiceNo', p.invoiceNo);
  if (!rows.length) throw new Error('Invoice ' + p.invoiceNo + ' not found');
  var sale = readRow_('Sales', rows[0]);
  if (sale.status === 'voided') return { duplicate: true };
  voidSale_({ id: sale.id });
  return {};
}

function syncProduct_(p) {
  var data = parseProduct_(p.product || {});
  var products = readTable_('Products');
  // A product created offline must never take over an existing one (e.g. same SKU made on another counter).
  var target = p.isCreate ? null : resolveProduct_(products, p.id, p.matchSku || data.sku);
  var iso = new Date().toISOString();
  if (target) {
    assertUnique_(products, data, target.id);
    Object.keys(data).forEach(function (k) { if (k !== 'stock') target[k] = data[k]; });
    target.updatedAt = iso;
    writeRow_('Products', target._row, target);
    return { productId: target.id };
  }
  if (!p.isCreate) return { warning: 'Product ' + (p.matchSku || data.sku) + ' no longer exists on the sheet — edit skipped' };
  assertUnique_(products, data, 0);
  data.id = lastId_('Products') + 1;
  data.createdAt = iso;
  data.updatedAt = iso;
  appendRows_('Products', [data]);
  if (data.stock > 0) appendRows_('StockMovements', [movement_(lastId_('StockMovements') + 1, data, data.stock, 'initial', 'Opening stock', iso)]);
  return { productId: data.id };
}

function syncDeleteProduct_(p) {
  var target = resolveProduct_(readTable_('Products'), p.id, p.sku);
  if (!target) return { duplicate: true };
  sheet_('Products').deleteRow(target._row);
  return {};
}

function syncStock_(p) {
  var prod = resolveProduct_(readTable_('Products'), p.id, p.sku);
  if (!prod) throw new Error('Product ' + (p.sku || p.id) + ' not found');
  var mode = p.mode === 'remove' || p.mode === 'set' ? p.mode : 'add';
  var qty = Number(p.quantity);
  if (!isFinite(qty) || qty < 0) throw new Error('Invalid quantity');
  var before = prod.stock;
  var after = mode === 'add' ? before + qty : mode === 'remove' ? before - qty : qty;
  var warning;
  if (after < 0) { warning = prod.name + ': only ' + before + ' left on the sheet, stock set to 0'; after = 0; }
  var change = r3_(after - before);
  var iso = new Date().toISOString();
  prod.stock = r3_(after);
  prod.updatedAt = iso;
  writeRow_('Products', prod._row, prod);
  if (change !== 0) {
    appendRows_('StockMovements', [movement_(lastId_('StockMovements') + 1, prod, change,
      mode === 'add' ? 'restock' : 'adjustment', str_(p.reason, 80), iso)]);
  }
  return warning ? { warning: warning } : {};
}

/* ------------------------------------------------------------------ */
/* Bulk import (data files + demo data)                               */
/* ------------------------------------------------------------------ */

function colValues_(name, colName) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, colIndex_(name, colName), last - 1, 1).getValues().map(function (r) { return String(r[0]); });
}

// Adds products (matched by SKU) and historical invoices (matched by invoice number). Existing rows are
// never changed, so importing the same file twice is harmless. Imported invoices don't change stock.
function importBulk_(req) {
  var inP = Array.isArray(req.products) ? req.products : [];
  var inS = Array.isArray(req.sales) ? req.sales : [];
  if (inS.length > 20000) throw new Error('Too many invoices in one import (max 20,000)');
  var out = { productsAdded: 0, productsSkipped: 0, salesAdded: 0, salesSkipped: 0 };
  var iso = new Date().toISOString();

  var products = readTable_('Products');
  var bySku = {}, codes = {};
  products.forEach(function (p) {
    bySku[String(p.sku).toLowerCase()] = p;
    if (p.barcode) codes[String(p.barcode).toLowerCase()] = true;
  });
  var nextPid = lastId_('Products') + 1, mvId = lastId_('StockMovements');
  var newP = [], moves = [];
  inP.forEach(function (raw) {
    var data;
    try { data = parseProduct_(raw); } catch (e) { out.productsSkipped++; return; }
    var sk = data.sku.toLowerCase(), bc = data.barcode ? data.barcode.toLowerCase() : '';
    if (bySku[sk] || (bc && codes[bc])) { out.productsSkipped++; return; }
    data.id = nextPid++;
    data.createdAt = iso;
    data.updatedAt = iso;
    bySku[sk] = data;
    if (bc) codes[bc] = true;
    newP.push(data);
    if (data.stock > 0) moves.push(movement_(++mvId, data, data.stock, 'initial', 'Opening stock', iso));
    out.productsAdded++;
  });
  appendRows_('Products', newP);
  appendRows_('StockMovements', moves);

  var seen = {};
  colValues_('Sales', 'invoiceNo').forEach(function (v) { seen[v.toLowerCase()] = true; });
  var saleId = lastId_('Sales'), itemId = lastId_('SaleItems');
  var saleRows = [], itemRows = [];
  inS.forEach(function (s) {
    var items = Array.isArray(s && s.items) ? s.items : [];
    if (!items.length || items.length > MAX_CART_LINES) { out.salesSkipped++; return; }
    var t = s.createdAt ? new Date(s.createdAt) : new Date();
    if (isNaN(t.getTime())) t = new Date();
    var id = saleId + 1;
    var inv = req.renumber || !s.invoiceNo
      ? 'INV-' + Utilities.formatDate(t, tz_(), 'yyyyMMdd') + '-' + pad_(id, 5)
      : str_(s.invoiceNo, 40);
    if (seen[inv.toLowerCase()]) { out.salesSkipped++; return; }
    seen[inv.toLowerCase()] = true;
    saleId = id;
    var voided = s.status === 'voided';
    saleRows.push({
      id: id, invoiceNo: inv, createdAt: t.toISOString(),
      customerName: str_(s.customerName, 80), customerPhone: str_(s.customerPhone, 24), customerAddress: str_(s.customerAddress, 300),
      subtotal: r2_(Number(s.subtotal) || 0), discount: r2_(Number(s.discount) || 0), tax: r2_(Number(s.tax) || 0),
      total: r2_(Number(s.total) || 0),
      paymentMethod: ['cash', 'card', 'upi'].indexOf(s.paymentMethod) >= 0 ? s.paymentMethod : 'cash',
      amountPaid: r2_(Number(s.amountPaid) || 0), changeDue: r2_(Number(s.changeDue) || 0),
      status: voided ? 'voided' : 'completed', note: str_(s.note, 200),
      voidedAt: voided ? (s.voidedAt || t.toISOString()) : null, clientRef: ''
    });
    items.forEach(function (it) {
      var prod = bySku[String(it.sku || '').toLowerCase()];
      itemRows.push({
        id: ++itemId, saleId: id, invoiceNo: inv, productId: prod ? prod.id : 0, sku: str_(it.sku, 40),
        name: str_(it.name, 120), emoji: str_(it.emoji, 8), unit: str_(it.unit, 12), price: Number(it.price) || 0,
        qty: r3_(Number(it.qty) || 0), taxRate: Number(it.taxRate) || 0,
        lineSubtotal: Number(it.lineSubtotal) || 0, lineTax: Number(it.lineTax) || 0
      });
    });
    out.salesAdded++;
  });
  appendRows_('Sales', saleRows);
  appendRows_('SaleItems', itemRows);
  if (req.settings && typeof req.settings === 'object') saveSettings_({ settings: req.settings });
  SpreadsheetApp.flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* Product photos → Google Drive                                       */
/* ------------------------------------------------------------------ */

function imagesFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGES_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder was deleted: make a new one */ }
  }
  var folder = DriveApp.createFolder('FreshMart POS Images');
  props.setProperty('IMAGES_FOLDER_ID', folder.getId());
  return folder;
}

function uploadImage_(req) {
  var data = String(req.dataUrl || '');
  var m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+\/=]+)$/.exec(data);
  if (!m) throw new Error('Not a supported image (use JPG, PNG, WebP or GIF)');
  if (data.length > 4000000) throw new Error('Image is too large (max ~3 MB)');
  var ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  var name = (str_(req.name, 60) || 'product').replace(/[^A-Za-z0-9_-]+/g, '_') + '-' + new Date().getTime() + '.' + ext;
  var file = imagesFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], name));
  var warning;
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    warning = 'Could not share the photo publicly (your Google account may block link sharing) — it may only show for you.';
  }
  return { url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w600', fileId: file.getId(), warning: warning };
}

// Run this once from the Apps Script editor if photo uploads report "authorization required".
function authorize() {
  DriveApp.getRootFolder();
  ss_().getName();
  return 'Authorised';
}


/* ------------------------------------------------------------------ */
/* Disaster recovery backups                                           */
/* ------------------------------------------------------------------ */
var BACKUP_ROOT = 'FreshMart POS Backups';
var BACKUP_RETENTION = { daily: 30, weekly: 12, monthly: 12, manual: 10 };

function backupProps_() { return PropertiesService.getScriptProperties(); }

function backupRoot_() {
  var props = backupProps_();
  var id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ }
  }
  var folder = DriveApp.createFolder(BACKUP_ROOT);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function backupSubfolder_(name) {
  var root = backupRoot_();
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function backupData_() {
  ensureAll_();
  var out = {
    app: 'freshmart-pos',
    format: 1,
    generatedAt: new Date().toISOString(),
    spreadsheet: { id: ss_().getId(), name: ss_().getName(), url: ss_().getUrl() },
    tables: {}
  };
  Object.keys(SCHEMA).forEach(function (name) { if (name !== 'AuthSessions') out.tables[name] = readTable_(name); });
  try {
    out.tables.Suppliers = procurementRead_('Suppliers');
    out.tables.Purchases = procurementRead_('Purchases');
    out.tables.PurchaseItems = procurementRead_('PurchaseItems');
    out.tables.ProcurementSyncLog = procurementRead_('ProcurementSyncLog');
  } catch (e) {
    // Procurement sheets are optional; core backup must still succeed.
  }
  return out;
}

function backupHash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function backupWriteJson_(kind) {
  var data = backupData_();
  var canonical = JSON.stringify(data);
  var payload = {
    app: 'freshmart-pos-backup',
    format: 1,
    kind: kind,
    generatedAt: new Date().toISOString(),
    sha256: backupHash_(canonical),
    bytes: canonical.length,
    counts: {
      products: (data.tables.Products || []).length,
      sales: (data.tables.Sales || []).length,
      saleItems: (data.tables.SaleItems || []).length,
      stockMovements: (data.tables.StockMovements || []).length,
      settings: (data.tables.Settings || []).length
    },
    data: data
  };
  var folder = backupSubfolder_(kind);
  var stamp = Utilities.formatDate(new Date(), tz_(), kind === 'monthly' ? 'yyyy-MM' : 'yyyy-MM-dd');
  var prefix = kind === 'weekly' ? 'FreshMart-POS-W-' : kind === 'monthly' ? 'FreshMart-POS-M-' : 'FreshMart-POS-';
  if (kind === 'manual') prefix = 'FreshMart-POS-manual-';
  var name = prefix + stamp + '-' + new Date().getTime() + '.json';
  var file = folder.createFile(name, JSON.stringify(payload, null, 2), MimeType.PLAIN_TEXT);
  return { fileId: file.getId(), name: name, url: file.getUrl(), sha256: payload.sha256, counts: payload.counts, generatedAt: payload.generatedAt };
}

function backupSpreadsheetCopy_(kind) {
  var folder = backupSubfolder_(kind);
  var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  var copy = DriveApp.getFileById(ss_().getId()).makeCopy('FreshMart POS - ' + kind + ' - ' + stamp, folder);
  return { fileId: copy.getId(), name: copy.getName(), url: copy.getUrl() };
}

function backupPrune_(kind) {
  var keep = BACKUP_RETENTION[kind] || 10;
  var folder = backupSubfolder_(kind);
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next();
    files.push({ file: file, created: file.getDateCreated().getTime() });
  }
  files.sort(function (a, b) { return b.created - a.created; });
  files.slice(keep).forEach(function (x) { try { x.file.setTrashed(true); } catch (e) {} });
}

function backupRun_(kind) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var json = backupWriteJson_(kind);
    var sheetCopy = backupSpreadsheetCopy_(kind);
    backupPrune_(kind);
    var props = backupProps_();
    props.setProperty('BACKUP_LAST_AT', json.generatedAt);
    props.setProperty('BACKUP_LAST_OK', 'true');
    props.deleteProperty('BACKUP_LAST_ERROR');
    props.setProperty('BACKUP_LAST_KIND', kind);
    props.setProperty('BACKUP_LAST_JSON_ID', json.fileId);
    props.setProperty('BACKUP_LAST_SHEET_ID', sheetCopy.fileId);
    return { ok: true, kind: kind, json: json, sheet: sheetCopy, message: 'Google Drive backup created successfully.' };
  } catch (e) {
    backupProps_().setProperty('BACKUP_LAST_OK', 'false');
    backupProps_().setProperty('BACKUP_LAST_ERROR', String(e && e.message || e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function freshmartDailyBackup_() { backupRun_('daily'); }
function freshmartWeeklyBackup_() { backupRun_('weekly'); }
function freshmartMonthlyBackup_() { backupRun_('monthly'); }

function backupSetup_() {
  var props = backupProps_();
  var root = backupRoot_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'freshmartDailyBackup_' || fn === 'freshmartWeeklyBackup_' || fn === 'freshmartMonthlyBackup_') ScriptApp.deleteTrigger(t);
  });
  var hour = 2;
  ScriptApp.newTrigger('freshmartDailyBackup_').timeBased().atHour(hour).everyDays(1).create();
  ScriptApp.newTrigger('freshmartWeeklyBackup_').timeBased().atHour(hour).everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).create();
  ScriptApp.newTrigger('freshmartMonthlyBackup_').timeBased().atHour(hour).onMonthDay(1).create();
  props.setProperty('BACKUP_CONFIGURED', 'true');
  props.setProperty('BACKUP_FOLDER_ID', root.getId());
  return { configured: true, folderUrl: root.getUrl(), message: 'Automatic daily, weekly and monthly Google Drive backups are enabled.' };
}

function backupStatus_() {
  var props = backupProps_();
  var configured = props.getProperty('BACKUP_CONFIGURED') === 'true';
  var folderUrl = '';
  var id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try { folderUrl = DriveApp.getFolderById(id).getUrl(); } catch (e) {}
  }
  return {
    configured: configured,
    folderUrl: folderUrl,
    lastBackupAt: props.getProperty('BACKUP_LAST_AT') || null,
    lastBackupOk: props.getProperty('BACKUP_LAST_OK') === 'true' ? true : props.getProperty('BACKUP_LAST_OK') === 'false' ? false : null,
    lastBackupError: props.getProperty('BACKUP_LAST_ERROR') || '',
    lastBackupKind: props.getProperty('BACKUP_LAST_KIND') || '',
    retention: BACKUP_RETENTION
  };
}

function backupNow_(req) {
  return backupRun_(str_(req && req.kind, 20) || 'manual');
}

function backupVerify_() {
  var props = backupProps_();
  var id = props.getProperty('BACKUP_LAST_JSON_ID');
  if (!id) return { ok: false, message: 'No Google Drive backup has been created yet.' };
  try {
    var file = DriveApp.getFileById(id);
    var payload = JSON.parse(file.getBlob().getDataAsString());
    if (payload.app !== 'freshmart-pos-backup' || !payload.data) throw new Error('Backup format is invalid.');
    var canonical = JSON.stringify(payload.data);
    var actual = backupHash_(canonical);
    var ok = actual === payload.sha256;
    if (!ok) throw new Error('Backup checksum does not match.');
    var counts = payload.counts || {};
    var actualCounts = {
      products: (payload.data.tables.Products || []).length,
      sales: (payload.data.tables.Sales || []).length,
      saleItems: (payload.data.tables.SaleItems || []).length,
      stockMovements: (payload.data.tables.StockMovements || []).length,
      settings: (payload.data.tables.Settings || []).length
    };
    Object.keys(actualCounts).forEach(function (k) { if (Number(counts[k]) !== actualCounts[k]) throw new Error('Backup record count mismatch for ' + k + '.'); });
    props.setProperty('BACKUP_LAST_OK', 'true');
    props.deleteProperty('BACKUP_LAST_ERROR');
    return { ok: true, message: 'Latest Google Drive JSON backup passed checksum and record-count verification.', generatedAt: payload.generatedAt, counts: actualCounts, fileUrl: file.getUrl() };
  } catch (e) {
    props.setProperty('BACKUP_LAST_OK', 'false');
    props.setProperty('BACKUP_LAST_ERROR', String(e && e.message || e));
    return { ok: false, message: String(e && e.message || e) };
  }
}

function auditHash_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function auditAppend_(req) {
  var actor = authSession_(String(req.authToken || ''));
  if (!actor) throw new Error('Authentication required or session expired. Sign in again.');
  var e = req.event || {};
  var rows = readTable_('AuditLog');
  var prev = rows.length ? String(rows[rows.length - 1].hash || '') : 'GENESIS';
  var item = {
    id: str_(e.id, 80) || Utilities.getUuid(), at: new Date().toISOString(),
    actorId: actor.id, actorName: actor.name, role: actor.role, deviceId: str_(req.deviceId, 120),
    action: str_(e.action, 120), module: str_(e.module, 80), detail: str_(e.detail, 500), entity: str_(e.entity, 120),
    level: str_(e.level, 20) || 'info', prevHash: prev
  };
  if (!item.action) throw new Error('Audit action is required.');
  item.hash = auditHash_([item.id,item.at,item.actorId,item.actorName,item.role,item.deviceId,item.action,item.module,item.detail,item.entity,item.level,item.prevHash].join('\\n'));
  appendRows_('AuditLog', [item]);
  return { auditId: item.id, hash: item.hash };
}

function backupRestore_(req) {
  var fileId = str_(req && req.fileId, 120);
  if (!fileId) throw new Error('Choose a backup file first.');
  // Always take a pre-operation snapshot before changing live data.
  var pre = backupRun_('manual');
  var file = DriveApp.getFileById(fileId);
  var payload = JSON.parse(file.getBlob().getDataAsString());
  if (payload.app !== 'freshmart-pos-backup' || !payload.data || !payload.sha256) throw new Error('Invalid FreshMart POS backup.');
  var canonical = JSON.stringify(payload.data);
  if (auditHash_(canonical) !== payload.sha256) throw new Error('Backup checksum does not match; restore aborted.');
  var tables = payload.data.tables || {};
  readTable_('AuthSessions').forEach(function (r) { if (!r.revoked) { r.revoked = true; writeRow_('AuthSessions', r._row, r); } });
  var restored = 0;
  Object.keys(SCHEMA).forEach(function (name) {
    if (name === 'AuthSessions' || name === 'SyncLog') return;
    var rows = Array.isArray(tables[name]) ? tables[name].map(function (r) { var o = {}; SCHEMA[name].forEach(function (col) { o[col[0]] = r[col[0]]; }); return o; }) : [];
    var sh = sheet_(name), last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, SCHEMA[name].length).clearContent();
    if (rows.length) { appendRows_(name, rows); restored += rows.length; }
  });
  SpreadsheetApp.flush();
  return { ok: true, restoredRows: restored, preRestoreBackup: pre.json, message: 'Restore completed. All active sessions were invalidated.' };
}



var PROCUREMENT_VERSION = '1.0.0';
var PROCUREMENT_SCHEMA = {
  Suppliers: [['id','n'],['name','s'],['phone','s'],['email','s'],['address','s'],['gstin','s'],['notes','s'],['active','b'],['createdAt','d'],['updatedAt','d']],
  Purchases: [['id','n'],['purchaseNo','s'],['supplierId','n'],['supplierName','s'],['invoiceNo','s'],['createdAt','d'],['receivedAt','d'],['status','s'],['subtotal','n'],['tax','n'],['total','n'],['notes','s']],
  PurchaseItems: [['id','n'],['purchaseId','n'],['productId','n'],['sku','s'],['name','s'],['unit','s'],['qty','n'],['unitCost','n'],['taxRate','n'],['lineSubtotal','n'],['lineTax','n']],
  ProcurementSyncLog: [['opId','s'],['appliedAt','d'],['ok','b'],['message','s']]
};

function procurementSetupSheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var cols = PROCUREMENT_SCHEMA[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,cols.length).setValues([cols.map(function(c){return c[0];})]).setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else {
    var have = sh.getRange(1,1,1,cols.length).getValues()[0];
    for (var i=0;i<cols.length;i++) if (!have[i]) sh.getRange(1,i+1).setValue(cols[i][0]).setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
  }
  return sh;
}
function procurementRead_(name) {
  var sh = procurementSetupSheet_(name), cols = PROCUREMENT_SCHEMA[name], last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2,1,last-1,cols.length).getValues(), out=[];
  vals.forEach(function(row,i){ var o={_row:i+2}; cols.forEach(function(c,j){ var v=row[j]; if(c[1]==='n') v=Number(v)||0; else if(c[1]==='b') v=v===true||String(v).toLowerCase()==='true'; else if(c[1]==='d') v=v?new Date(v).toISOString():null; else v=v==null?'':String(v); o[c[0]]=v; }); if(name==='ProcurementSyncLog'||o.id>0) out.push(o); });
  return out;
}
function procurementAppend_(name, objs) { if(!objs.length)return; var sh=procurementSetupSheet_(name), cols=PROCUREMENT_SCHEMA[name]; sh.getRange(sh.getLastRow()+1,1,objs.length,cols.length).setValues(objs.map(function(o){return cols.map(function(c){var v=o[c[0]]; if(c[1]==='n')return Number(v)||0; if(c[1]==='b')return !!v; if(c[1]==='d')return v?new Date(v):''; return v==null?'':String(v);});})); }
function procurementWrite_(name,row,obj){var sh=procurementSetupSheet_(name),cols=PROCUREMENT_SCHEMA[name]; sh.getRange(row,1,1,cols.length).setValues([cols.map(function(c){var v=obj[c[0]]; if(c[1]==='n')return Number(v)||0; if(c[1]==='b')return !!v; if(c[1]==='d')return v?new Date(v):''; return v==null?'':String(v);})]);}
function procurementLastId_(name){return procurementRead_(name).reduce(function(m,r){return Math.max(m,Number(r.id)||0);},0);}
function procurementStr_(v,n){return String(v==null?'':v).trim().slice(0,n||200);}
function procurementNum_(v){var n=Number(v);return isFinite(n)?n:0;}
function procurementFind_(rows,id){return rows.find(function(r){return Number(r.id)===Number(id);})||null;}

function procurementBootstrap_(){
  return {version:PROCUREMENT_VERSION,suppliers:procurementRead_('Suppliers'),purchases:procurementRead_('Purchases'),purchaseItems:procurementRead_('PurchaseItems')};
}

function procurementSync_(req){
  var ops=Array.isArray(req.ops)?req.ops.slice(0,50):[], log=procurementRead_('ProcurementSyncLog'), seen={};
  log.forEach(function(x){seen[x.opId]=x;});
  var results=[];
  ops.forEach(function(op){
    var id=procurementStr_(op&&op.opId,64);
    if(!id){results.push({opId:'',ok:false,error:'Missing opId'});return;}
    if(seen[id]){results.push({opId:id,ok:seen[id].ok,duplicate:true,error:seen[id].message||undefined});return;}
    var res;
    try{res=procurementApply_(op)||{};res.ok=true;}catch(e){res={ok:false,error:String(e&&e.message||e)};}
    res.opId=id; procurementAppend_('ProcurementSyncLog',[{opId:id,appliedAt:new Date().toISOString(),ok:res.ok,message:res.error||''}]); seen[id]={ok:res.ok,message:res.error||''}; results.push(res);
  });
  SpreadsheetApp.flush();
  return {results:results, ...procurementBootstrap_()};
}

function procurementApply_(op){
  var p=op.payload||{}, now=new Date().toISOString();
  if(op.type==='supplier.save'){
    var rows=procurementRead_('Suppliers'), data={id:Number(p.supplier.id)||0,name:procurementStr_(p.supplier.name,120),phone:procurementStr_(p.supplier.phone,40),email:procurementStr_(p.supplier.email,120),address:procurementStr_(p.supplier.address,300),gstin:procurementStr_(p.supplier.gstin,40),notes:procurementStr_(p.supplier.notes,300),active:p.supplier.active!==false,createdAt:p.supplier.createdAt||now,updatedAt:now};
    var target=procurementFind_(rows,data.id);
    if(target){data.id=target.id;data.createdAt=target.createdAt;procurementWrite_('Suppliers',target._row,data);} else {data.id=procurementLastId_('Suppliers')+1;procurementAppend_('Suppliers',[data]);}
    return {id:data.id};
  }
  if(op.type==='supplier.delete'){
    var rows2=procurementRead_('Suppliers'),t=procurementFind_(rows2,p.id); if(t) procurementWrite_('Suppliers',t._row,{...t,active:false,updatedAt:now}); return {};
  }
  if(op.type==='purchase.save'){
    var pr=procurementRead_('Purchases'), x=p.purchase||{}, pid=Number(x.id)||0, targetP=procurementFind_(pr,pid);
    if(targetP) throw new Error('Purchase records cannot be edited after receipt');
    var nextPurchaseId=procurementLastId_('Purchases')+1;
    var purchase={id:nextPurchaseId,purchaseNo:procurementStr_(x.purchaseNo,40)||('PUR-'+Utilities.formatDate(new Date(),tz_(),'yyyyMMdd')+'-'+String(nextPurchaseId).padStart(5,'0')),supplierId:Number(x.supplierId)||0,supplierName:procurementStr_(x.supplierName,120),invoiceNo:procurementStr_(x.invoiceNo,60),createdAt:x.createdAt||now,receivedAt:x.receivedAt||now,status:'received',subtotal:procurementNum_(x.subtotal),tax:procurementNum_(x.tax),total:procurementNum_(x.total),notes:procurementStr_(x.notes,300)};
    procurementAppend_('Purchases',[purchase]);
    var next=procurementLastId_('PurchaseItems'), rows=[]; (p.items||[]).forEach(function(q){rows.push({id:++next,purchaseId:purchase.id,productId:Number(q.productId)||0,sku:procurementStr_(q.sku,40),name:procurementStr_(q.name,120),unit:procurementStr_(q.unit,12),qty:procurementNum_(q.qty),unitCost:procurementNum_(q.unitCost),taxRate:procurementNum_(q.taxRate),lineSubtotal:procurementNum_(q.lineSubtotal),lineTax:procurementNum_(q.lineTax)});}); procurementAppend_('PurchaseItems',rows);
    rows.forEach(function(q){ var rr=findRows_('Products','id',q.productId); if(rr.length){ var prod=readRow_('Products',rr[0]); prod.cost=q.unitCost; prod.updatedAt=now; writeRow_('Products',prod._row,prod); } });
    return {purchaseId:purchase.id,purchaseNo:purchase.purchaseNo};
  }
  throw new Error('Unknown procurement operation: '+op.type);
}
