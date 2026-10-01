// Lightweight barcode SVG renderer for product labels.
// Uses EAN-13 when the value is a valid EAN/UPC number; otherwise Code 128-B.
// No external dependency, so labels also work fully offline.

const EAN_L = [
  "0001101","0011001","0010011","0111101","0100011",
  "0110001","0101111","0111011","0110111","0001011",
];
const EAN_G = [
  "0100111","0110011","0011011","0100001","0011101",
  "0111001","0000101","0010001","0001001","0010111",
];
const EAN_R = [
  "1110010","1100110","1101100","1000010","1011100",
  "1001110","1010000","1000100","1001000","1110100",
];
const EAN_PARITY = [
  "LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG",
  "LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL",
];

const CODE128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

const xmlEsc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function validEan13(v) {
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (i % 2 === 0 ? 1 : 3);
  return ((10 - (sum % 10)) % 10) === Number(v[12]);
}

function ean13Bits(v) {
  const first = Number(v[0]);
  let bits = "101";
  const parity = EAN_PARITY[first];
  for (let i = 1; i <= 6; i++) {
    const n = Number(v[i]);
    bits += parity[i - 1] === "L" ? EAN_L[n] : EAN_G[n];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(v[i])];
  bits += "101";
  return bits;
}

function patternBits(patterns) {
  let bits = "";
  for (const p of patterns) {
    for (let i = 0; i < p.length; i++) bits += (i % 2 === 0 ? "1" : "0").repeat(Number(p[i]));
  }
  return bits;
}

function renderRuns(bits, x0) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= bits.length; i++) {
    const on = i < bits.length && bits[i] === "1";
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push({ x: x0 + start, w: i - start });
      start = -1;
    }
  }
  return out;
}

export function normalizeBarcodeValue(value) {
  return String(value ?? "").trim();
}

/**
 * Returns a self-contained SVG data URI.
 * Valid 13-digit EAN values render as EAN-13. Other ASCII values render as Code 128-B.
 */
export function barcodeSvg(value, { showValue = true } = {}) {
  let v = normalizeBarcodeValue(value);
  if (!v) throw new Error("Barcode value is empty");

  let bits;
  let display = v;
  let quiet;
  let ean = false;

  if (/^\d{12}$/.test(v) && validEan13("0" + v)) {
    // UPC-A is represented as EAN-13 with a leading zero.
    bits = ean13Bits("0" + v);
    quiet = 9;
    ean = true;
  } else if (validEan13(v)) {
    bits = ean13Bits(v);
    quiet = 9;
    ean = true;
  } else {
    const values = [...v].map((ch) => ch.charCodeAt(0) - 32);
    let checksum = 104;
    values.forEach((n, i) => { checksum += n * (i + 1); });
    const codes = [104, ...values, checksum % 103, 106];
    bits = patternBits(codes.map((c) => CODE128[c]));
    quiet = 10;
  }

  const moduleCount = bits.length + quiet * 2;
  const barHeight = ean ? 76 : 70;
  const textY = 94;
  const rects = renderRuns(bits, quiet)
    .map((r) => `<rect x="${r.x}" y="8" width="${r.w}" height="${barHeight}" fill="#000"/>`)
    .join("");

  const valueText = showValue
    ? `<text x="${moduleCount / 2}" y="${textY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#000">${xmlEsc(display)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${moduleCount} 100" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${xmlEsc(display)}"><rect width="${moduleCount}" height="100" fill="#fff"/>${rects}${valueText}</svg>`;
}

export const barcodeUrl = (value, opts) =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(barcodeSvg(value, opts));
