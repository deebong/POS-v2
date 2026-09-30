// Product pictures: emoji or photo (from this PC, a web link or Google Drive).
import { safeImageUrl } from "./data/logic.js";
import { state } from "./store.js";
import { esc } from "./ui.js";

export const photoMode = () => state.settings.productImageMode === "photo";

/** Inner HTML for a product picture box (.thumb / .pic): the photo if available, else the emoji. */
export function mediaHtml(p) {
  const emoji = `<span class="emo">${esc((p && p.emoji) || "🛒")}</span>`;
  const url = photoMode() ? safeImageUrl(p && p.imageUrl) : "";
  if (!url) return emoji;
  return `${emoji}<img class="ph" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`;
}

/** Accepts an image link or a Google Drive share link and returns a URL that works in <img>. */
export function toImageUrl(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  const m =
    s.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{20,})/) ||
    s.match(/docs\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600`;
  return safeImageUrl(s);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image — try a JPG or PNG"));
    img.src = src;
  });
}

/**
 * Resizes a photo in the browser and returns a JPEG data URL no longer than `limit` characters.
 * Small (≈20–40 KB) versions fit in a Google Sheets cell; bigger ones are for Drive uploads.
 */
export async function fileToDataUrl(file, { max = 320, limit = 45000 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Please choose an image file (JPG, PNG or WebP)");
  if (file.size > 25 * 1024 * 1024) throw new Error("That file is larger than 25 MB");
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    let size = max;
    let quality = 0.82;
    let out = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      out = canvas.toDataURL("image/jpeg", quality);
      if (out.length <= limit) return out;
      if (quality > 0.55) quality -= 0.12;
      else size = Math.round(size * 0.8);
    }
    throw new Error("That photo is too detailed to store — try a smaller one");
  } finally {
    URL.revokeObjectURL(src);
  }
}
