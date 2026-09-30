// Client-side QR code generation (vendor/qrcode.js = qrcode-generator, MIT). No server needed.

function makeQr(text, ecc) {
  const gen = window.qrcode;
  if (!gen) throw new Error("QR library failed to load");
  if (gen.stringToBytesFuncs && gen.stringToBytesFuncs["UTF-8"]) gen.stringToBytes = gen.stringToBytesFuncs["UTF-8"];
  const qr = gen(0, ecc);
  qr.addData(String(text));
  qr.make();
  return qr;
}

/** SVG markup for a QR code. Pass `size` (px) to give the SVG an explicit width/height. */
export function qrSvg(text, { margin = 2, ecc = "M", size } = {}) {
  let qr;
  try {
    qr = makeQr(text, ecc);
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#eee"/></svg>`;
  }
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  const total = n + margin * 2;
  const dim = size ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dim} shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export const qrDataUri = (text, opts) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrSvg(text, opts));

/** Drop-in for <img src>. */
export const qrUrl = (text) => qrDataUri(text);

/** PNG blob (for downloads). */
export function qrPngBlob(text, px = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = px;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("Could not render the QR code"));
    img.src = qrDataUri(text, { size: px });
  });
}
