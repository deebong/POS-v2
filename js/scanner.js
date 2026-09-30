// Camera scanner: BarcodeDetector when available, jsQR (QR only) as fallback.
// Also supports manual entry. USB/Bluetooth scanners work via the POS search box (keyboard wedge).
import { beep, esc, icon, openModal } from "./ui.js";

/**
 * onCode(code) -> Promise<{ ok: boolean, message?: string } | void>
 * continuous: keep the camera open after each successful scan (POS mode).
 */
export function openScanner({ title = "Scan QR / barcode", continuous = false, onCode } = {}) {
  let stream = null;
  let running = true;
  let detector = null;
  let last = { code: "", t: 0 };
  let busy = false;

  const modal = openModal({
    title,
    sub: continuous ? "Keep scanning — items are added instantly" : "Point the camera at a product QR, barcode or invoice QR",
    size: "md",
    body: `
      <div class="scanner-view" id="scView"><div class="scan-msg" id="scMsg">${icon("camera", "lg")}<p style="margin-top:8px">Starting camera…</p></div></div>
      <form class="scan-manual" id="scForm">
        <input class="input" id="scInput" autocomplete="off" placeholder="…or type a SKU, barcode or invoice no." />
        <button class="btn btn-primary" type="submit">Lookup</button>
      </form>`,
    footer: `<button class="btn btn-outline" data-done>${continuous ? "Done" : "Cancel"}</button>`,
    onClose: stop,
  });

  const view = modal.$("#scView");
  const input = modal.$("#scInput");
  modal.$("[data-done]").onclick = () => modal.close();

  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function flash(text, ok = true) {
    const el = document.createElement("div");
    el.className = "scan-flash";
    if (!ok) el.style.background = "rgba(229,72,77,.95)";
    el.innerHTML = `${icon(ok ? "check" : "alert")}<span>${esc(text)}</span>`;
    view.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  async function handle(raw, fromCamera) {
    const code = String(raw || "").trim();
    if (!code || busy) return;
    const now = Date.now();
    if (fromCamera && code === last.code && now - last.t < 2500) return;
    last = { code, t: now };
    busy = true;
    try {
      const res = (await onCode(code)) || { ok: true };
      if (res.ok) beep();
      if (res.message) flash(res.message, res.ok);
      if (res.ok && !continuous) setTimeout(() => modal.close(), 350);
      if (!fromCamera) {
        input.value = "";
        input.focus();
      }
    } finally {
      busy = false;
    }
  }

  modal.$("#scForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handle(input.value, false);
  });

  function showMessage(html) {
    view.innerHTML = `<div class="scan-msg">${html}</div>`;
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMessage(`${icon("alert", "lg")}<p style="margin-top:8px">Camera isn't available in this browser or connection (HTTPS is required). Use the box below, or a handheld scanner.</p>`);
      input.focus();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      showMessage(`${icon("alert", "lg")}<p style="margin-top:8px">Camera permission was denied or no camera was found. Type the code below instead.</p>`);
      input.focus();
      return;
    }
    if (!running) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.muted = true;
    video.srcObject = stream;
    view.innerHTML = "";
    view.append(video);
    view.insertAdjacentHTML("beforeend", '<div class="scan-frame"></div><div class="scan-line"></div>');
    await video.play().catch(() => {});

    if ("BarcodeDetector" in window) {
      try {
        detector = new window.BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
      } catch {
        detector = null;
      }
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = async () => {
      if (!running) return;
      if (video.readyState >= 2 && !busy) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes.length) await handle(codes[0].rawValue, true);
          } else if (window.jsQR) {
            const scale = Math.min(1, 560 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (res && res.data) await handle(res.data, true);
          }
        } catch {
          /* ignore frame errors */
        }
      }
      setTimeout(() => requestAnimationFrame(tick), 110);
    };
    tick();
  }

  start();
  return modal;
}
