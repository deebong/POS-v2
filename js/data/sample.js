// Sample grocery catalogue + demo sales history generator.
import { emptyDb, importProducts } from "./engine.js";
import { DEFAULT_SETTINGS, calcTotals, invoiceNumber, round2 } from "./logic.js";

// sku, name, category, emoji, unit, price (₹), cost (₹), GST %, stock, reorderLevel
const ROWS = [
  ["FV-1001", "Bananas (Robusta)", "Fruits & Veg", "🍌", "kg", 48, 32, 0, 62, 15],
  ["FV-1002", "Shimla Apples", "Fruits & Veg", "🍎", "kg", 180, 130, 0, 48, 15],
  ["FV-1003", "Tomatoes", "Fruits & Veg", "🍅", "kg", 40, 26, 0, 35, 12],
  ["FV-1004", "Carrots", "Fruits & Veg", "🥕", "kg", 50, 32, 0, 40, 12],
  ["FV-1005", "Potatoes", "Fruits & Veg", "🥔", "kg", 35, 22, 0, 90, 20],
  ["FV-1006", "Broccoli", "Fruits & Veg", "🥦", "pc", 60, 38, 0, 26, 8],
  ["FV-1007", "Avocado (Imported)", "Fruits & Veg", "🥑", "pc", 120, 80, 0, 7, 10],
  ["FV-1008", "Lemons", "Fruits & Veg", "🍋", "kg", 120, 80, 0, 14, 5],
  ["FV-1009", "Strawberries 200g", "Fruits & Veg", "🍓", "pack", 99, 65, 0, 18, 8],
  ["FV-1010", "Onions", "Fruits & Veg", "🧅", "kg", 38, 25, 0, 55, 15],
  ["DA-2001", "Toned Milk 1L", "Dairy & Eggs", "🥛", "pc", 56, 50, 0, 84, 24],
  ["DA-2002", "Cheese Slices 200g", "Dairy & Eggs", "🧀", "pack", 145, 118, 12, 4, 10],
  ["DA-2003", "Farm Eggs (12)", "Dairy & Eggs", "🥚", "pack", 84, 66, 0, 46, 12],
  ["DA-2004", "Fresh Curd 400g", "Dairy & Eggs", "🥣", "pc", 45, 36, 5, 32, 10],
  ["DA-2005", "Salted Butter 100g", "Dairy & Eggs", "🧈", "pack", 58, 49, 12, 28, 8],
  ["BK-3001", "Brown Bread", "Bakery", "🍞", "pc", 50, 38, 0, 16, 6],
  ["BK-3002", "Butter Croissant", "Bakery", "🥐", "pc", 60, 32, 18, 30, 10],
  ["BK-3003", "Pav (6 pcs)", "Bakery", "🥯", "pack", 35, 24, 0, 12, 6],
  ["BK-3004", "Garlic Baguette", "Bakery", "🥖", "pc", 90, 52, 18, 0, 8],
  ["MS-4001", "Chicken Breast", "Meat & Seafood", "🍗", "kg", 320, 240, 0, 22, 8],
  ["MS-4002", "Mutton Curry Cut", "Meat & Seafood", "🥩", "kg", 780, 640, 0, 18, 8],
  ["MS-4003", "Rohu Fish", "Meat & Seafood", "🐟", "kg", 280, 200, 0, 3.5, 5],
  ["MS-4004", "Chicken Sausages 250g", "Meat & Seafood", "🥓", "pack", 180, 130, 12, 20, 8],
  ["BV-5001", "Orange Juice 1L", "Beverages", "🍊", "pc", 120, 88, 12, 38, 12],
  ["BV-5002", "Mineral Water 1L", "Beverages", "💧", "pc", 20, 12, 18, 120, 30],
  ["BV-5003", "Cold Drink 750ml", "Beverages", "🥤", "pc", 40, 29, 28, 96, 30],
  ["BV-5004", "Green Tea (25 bags)", "Beverages", "🍵", "pack", 165, 110, 5, 25, 8],
  ["BV-5005", "Filter Coffee 200g", "Beverages", "☕", "pack", 210, 150, 5, 21, 8],
  ["BV-5006", "Energy Drink 250ml", "Beverages", "⚡", "pc", 125, 85, 28, 9, 12],
  ["SN-6001", "Potato Chips", "Snacks", "🍟", "pc", 20, 13, 12, 58, 15],
  ["SN-6002", "Dark Chocolate", "Snacks", "🍫", "pc", 99, 68, 18, 44, 12],
  ["SN-6003", "Roasted Peanuts 200g", "Snacks", "🥜", "pack", 60, 42, 5, 35, 10],
  ["SN-6004", "Butter Popcorn", "Snacks", "🍿", "pack", 45, 28, 12, 27, 10],
  ["SN-6005", "Cookies", "Snacks", "🍪", "pack", 30, 20, 18, 33, 10],
  ["PN-7001", "Basmati Rice 5kg", "Pantry", "🍚", "pack", 650, 520, 5, 19, 6],
  ["PN-7002", "Wheat Atta 5kg", "Pantry", "🌾", "pack", 280, 235, 0, 70, 20],
  ["PN-7003", "Sunflower Oil 1L", "Pantry", "🌻", "pc", 165, 140, 5, 24, 8],
  ["PN-7004", "Sugar 1kg", "Pantry", "🍬", "pack", 48, 40, 5, 52, 15],
  ["PN-7005", "Iodised Salt 1kg", "Pantry", "🧂", "pack", 28, 20, 0, 41, 10],
  ["PN-7006", "Honey 500g", "Pantry", "🍯", "pc", 245, 180, 5, 15, 6],
  ["PN-7007", "Tomato Ketchup", "Pantry", "🥫", "pc", 110, 80, 12, 29, 10],
  ["PN-7008", "Toor Dal 1kg", "Pantry", "🍲", "pack", 165, 140, 0, 8, 10],
  ["HH-8001", "Dishwash Liquid 500ml", "Household", "🧴", "pc", 99, 70, 18, 30, 10],
  ["HH-8002", "Kitchen Towels (2 rolls)", "Household", "🧻", "pack", 120, 82, 18, 26, 8],
  ["HH-8003", "Detergent Powder 1kg", "Household", "🧺", "pc", 140, 105, 18, 14, 6],
  ["HH-8004", "Garbage Bags (30)", "Household", "🗑️", "pack", 110, 70, 18, 22, 8],
  ["PC-9001", "Toothpaste 150g", "Personal Care", "🪥", "pc", 95, 70, 18, 36, 10],
  ["PC-9002", "Shampoo 180ml", "Personal Care", "🧴", "pc", 175, 125, 18, 17, 8],
  ["PC-9003", "Hand Wash 200ml", "Personal Care", "🧼", "pc", 99, 65, 18, 40, 10],
  ["FZ-1101", "Vanilla Ice Cream 700ml", "Frozen", "🍨", "pc", 199, 140, 18, 18, 6],
  ["FZ-1102", "Frozen Pizza", "Frozen", "🍕", "pc", 249, 170, 12, 13, 6],
  ["FZ-1103", "Green Peas 500g", "Frozen", "🫛", "pack", 90, 60, 5, 31, 8],
];

function ean13(base12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base12[i]) * (i % 2 === 0 ? 1 : 3);
  return base12 + ((10 - (sum % 10)) % 10);
}

/** Plain product objects (no ids) — also used to seed an empty Google Sheet. */
export function sampleProducts() {
  return ROWS.map((r, i) => ({
    sku: r[0],
    barcode: ean13("8901" + String(10000 + i).padStart(8, "0")),
    name: r[1],
    category: r[2],
    emoji: r[3],
    unit: r[4],
    price: r[5],
    cost: r[6],
    taxRate: r[7],
    stock: r[8],
    reorderLevel: r[9],
    isActive: true,
  }));
}

const rand = (n) => Math.floor(Math.random() * n);
const CUSTOMERS = ["Priya Sharma", "Rahul Verma", "Ananya Iyer", "Arjun Nair", "Sneha Patel", "Vikram Rao", "Meera Joshi", "Walk-in customer"];

/** Fresh demo database: catalogue + 14 days of sales history. */
export function buildDemoDb() {
  const db = emptyDb();
  db.settings = { ...DEFAULT_SETTINGS };
  importProducts(db, { products: sampleProducts() });

  const now = Date.now();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const drafts = [];
  for (let d = 13; d >= 0; d--) {
    const orders = d === 0 ? 11 : 14 + rand(14);
    for (let i = 0; i < orders; i++) {
      let ts;
      if (d === 0) {
        const span = Math.max(now - startToday.getTime() - 120000, 120000);
        ts = now - Math.random() * span;
      } else {
        ts = startToday.getTime() - d * 86400000 + (8 + Math.random() * 12) * 3600000;
      }
      const picked = new Set();
      const lineCount = 1 + rand(6);
      while (picked.size < lineCount) picked.add(rand(db.products.length));
      const chosen = [...picked].map((idx) => {
        const p = db.products[idx];
        const weighed = p.unit === "kg" || p.unit === "l";
        const qty = weighed ? Math.round((0.3 + Math.random() * 2) * 4) / 4 : 1 + (Math.random() < 0.3 ? rand(3) : 0);
        return { p, qty };
      });
      const disc = Math.random() < 0.1;
      const calc = calcTotals(
        chosen.map(({ p, qty }) => ({ price: p.price, qty, taxRate: p.taxRate })),
        { type: disc ? "percent" : "none", value: disc ? 10 : 0 },
      );
      const r = Math.random();
      const method = r < 0.35 ? "cash" : r < 0.6 ? "card" : "upi";
      const paid = method === "cash" ? Math.ceil(calc.total / 10) * 10 : calc.total;
      drafts.push({ ts, chosen, calc, method, paid });
    }
  }
  drafts.sort((a, b) => a.ts - b.ts);
  let itemId = 1;
  drafts.forEach((dr, i) => {
    const id = i + 1;
    const created = new Date(dr.ts);
    db.sales.push({
      id,
      invoiceNo: invoiceNumber(id, created),
      customerName: Math.random() < 0.3 ? CUSTOMERS[rand(CUSTOMERS.length)] : null,
      customerPhone: null,
      subtotal: dr.calc.subtotal,
      discount: dr.calc.discount,
      tax: dr.calc.tax,
      total: dr.calc.total,
      paymentMethod: dr.method,
      amountPaid: dr.paid,
      changeDue: round2(dr.paid - dr.calc.total),
      status: "completed",
      note: null,
      createdAt: created.toISOString(),
      voidedAt: null,
      clientRef: null,
    });
    dr.chosen.forEach(({ p, qty }, k) => {
      db.saleItems.push({
        id: itemId++,
        saleId: id,
        productId: p.id,
        name: p.name,
        sku: p.sku,
        emoji: p.emoji,
        unit: p.unit,
        price: p.price,
        qty,
        taxRate: p.taxRate,
        lineSubtotal: dr.calc.lines[k].lineSubtotal,
        lineTax: dr.calc.lines[k].lineTax,
      });
    });
  });
  return db;
}

/** Demo data in the bulk-import format (products + 2 weeks of invoices with their lines). */
export function demoPayload() {
  const db = buildDemoDb();
  const bySale = new Map();
  for (const it of db.saleItems) {
    if (!bySale.has(it.saleId)) bySale.set(it.saleId, []);
    const { id, saleId, productId, ...line } = it; // eslint-disable-line no-unused-vars
    bySale.get(it.saleId).push(line);
  }
  return {
    renumber: true,
    products: db.products.map(({ id, createdAt, updatedAt, ...p }) => p), // eslint-disable-line no-unused-vars
    sales: db.sales.map(({ id, clientRef, ...s }) => ({ ...s, items: bySale.get(id) || [] })), // eslint-disable-line no-unused-vars
  };
}
