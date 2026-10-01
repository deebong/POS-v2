/**
 * Optional demo-data seeder for Supplier/Purchase Management.
 * Run seedProcurementDemo() once from Apps Script after Code.gs has been deployed.
 * It never overwrites existing procurement rows and does NOT change inventory stock.
 * Delete this file from the Apps Script project after seeding if desired.
 */
function seedProcurementDemo() {
  return withLock_(function () {
    var existingSuppliers = procurementRead_('Suppliers');
    var existingPurchases = procurementRead_('Purchases');
    var existingItems = procurementRead_('PurchaseItems');
    if (existingSuppliers.length || existingPurchases.length || existingItems.length) {
      throw new Error('Demo seed stopped: procurement data already exists. No rows were changed.');
    }

    var ss = ss_();
    var productSheet = ss.getSheetByName('Products');
    var productMap = {};
    if (productSheet && productSheet.getLastRow() > 1) {
      var rows = productSheet.getRange(2, 1, productSheet.getLastRow() - 1, 16).getValues();
      rows.forEach(function (r) {
        var sku = String(r[1] || '').trim();
        if (sku) productMap[sku] = { id: Number(r[0]) || 0, sku: sku, name: String(r[3] || ''), unit: String(r[6] || 'pc'), taxRate: Number(r[9]) || 0 };
      });
    }

    var catalog = [
      { sku: 'PN-7001', fallbackId: 36, name: 'Basmati Rice 5kg', unit: 'pack', cost: 520, tax: 5 },
      { sku: 'PN-7002', fallbackId: 37, name: 'Wheat Atta 5kg', unit: 'pack', cost: 235, tax: 0 },
      { sku: 'DA-2001', fallbackId: 11, name: 'Toned Milk 1L', unit: 'pc', cost: 50, tax: 0 },
      { sku: 'BK-3001', fallbackId: 16, name: 'Brown Bread', unit: 'pc', cost: 38, tax: 0 },
      { sku: 'SN-6003', fallbackId: 33, name: 'Roasted Peanuts 200g', unit: 'pack', cost: 42, tax: 5 },
      { sku: 'BV-5001', fallbackId: 24, name: 'Orange Juice 1L', unit: 'pc', cost: 88, tax: 12 }
    ];
    catalog = catalog.map(function (p) {
      var real = productMap[p.sku] || {};
      return { id: real.id || p.fallbackId, sku: p.sku, name: real.name || p.name, unit: real.unit || p.unit, cost: p.cost, tax: real.taxRate || p.tax };
    });

    var suppliers = [
      { id: 1, name: 'Sri Lakshmi Distributors', phone: '98430 11223', email: 'sales@lakshmidist.example', address: 'Gandhipuram, Coimbatore, Tamil Nadu', gstin: '33AAAPL1234A1Z5', notes: 'General grocery distributor', active: true },
      { id: 2, name: 'Kovai Fresh Foods', phone: '97890 44556', email: 'orders@kovaifresh.example', address: 'Singanallur, Coimbatore, Tamil Nadu', gstin: '33AABFK5678B1Z2', notes: 'Dairy and bakery supply', active: true },
      { id: 3, name: 'Southern Beverages & Snacks', phone: '96001 77889', email: 'supply@southernb.example', address: 'Peelamedu, Coimbatore, Tamil Nadu', gstin: '33AACFS9012C1Z7', notes: 'Beverages and packaged snacks', active: true }
    ];
    var base = new Date();
    function isoDaysAgo(n) { var d = new Date(base.getTime() - n * 86400000); return d.toISOString(); }
    suppliers.forEach(function (s) { s.createdAt = isoDaysAgo(60); s.updatedAt = isoDaysAgo(2); });
    procurementAppend_('Suppliers', suppliers);

    var specs = [
      { no: 1, days: 24, supplierId: 1, invoice: 'SLD-24118', lines: [[0, 20, 520], [1, 24, 235]] },
      { no: 2, days: 19, supplierId: 2, invoice: 'KFF-9821', lines: [[2, 30, 50], [3, 18, 38]] },
      { no: 3, days: 15, supplierId: 3, invoice: 'SBS-7714', lines: [[4, 25, 42], [5, 18, 88]] },
      { no: 4, days: 10, supplierId: 1, invoice: 'SLD-24203', lines: [[0, 15, 518], [1, 20, 234]] },
      { no: 5, days: 6, supplierId: 2, invoice: 'KFF-9910', lines: [[2, 36, 50], [3, 24, 38]] },
      { no: 6, days: 2, supplierId: 3, invoice: 'SBS-7842', lines: [[4, 30, 41.5], [5, 24, 87.5]] }
    ];
    var purchases = [], items = [], itemId = 1;
    specs.forEach(function (sp, pi) {
      var created = isoDaysAgo(sp.days), supplier = suppliers[sp.supplierId - 1], subtotal = 0, tax = 0, purchaseId = pi + 1;
      var lineRows = [];
      sp.lines.forEach(function (line) {
        var p = catalog[line[0]], qty = line[1], cost = line[2], rate = p.tax || 0;
        var ls = qty * cost, lt = ls * rate / 100; subtotal += ls; tax += lt;
        lineRows.push({ id: itemId++, purchaseId: purchaseId, productId: p.id, sku: p.sku, name: p.name, unit: p.unit, qty: qty, unitCost: cost, taxRate: rate, lineSubtotal: ls, lineTax: lt });
      });
      purchases.push({ id: purchaseId, purchaseNo: 'PUR-DEMO-' + String(1000 + purchaseId), supplierId: sp.supplierId, supplierName: supplier.name, invoiceNo: sp.invoice, createdAt: created, receivedAt: created, status: 'received', subtotal: subtotal, tax: tax, total: subtotal + tax, notes: 'Demo purchase — imported for POS preview' });
      items = items.concat(lineRows);
    });
    procurementAppend_('Purchases', purchases);
    procurementAppend_('PurchaseItems', items);
    SpreadsheetApp.flush();
    return { ok: true, suppliers: suppliers.length, purchases: purchases.length, purchaseItems: items.length, note: 'Demo procurement data inserted. Inventory stock was not changed.' };
  });
}
