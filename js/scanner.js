// Escáner de código de barras con la cámara.
// Usa el detector nativo del navegador si existe (Chrome en Android);
// si no (iPhone, Firefox), carga la librería html5-qrcode bajo demanda.

import { normalizeIsbn } from "./isbn.js";

const FALLBACK_LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

function loadScript(src) {
  return new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => fail(new Error("No se pudo cargar el escáner."));
    document.head.appendChild(s);
  });
}

async function nativeSupported() {
  if (!("BarcodeDetector" in window)) return false;
  try {
    const f = await BarcodeDetector.getSupportedFormats();
    return f.includes("ean_13");
  } catch { return false; }
}

// Abre el escáner a pantalla completa. Resuelve con un ISBN-13 o null si se cancela.
export function scanIsbn() {
  return new Promise(async (resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "scanner";
    overlay.innerHTML = `
      <div class="scanner-view" id="scanner-view"><video playsinline muted></video></div>
      <div class="scanner-frame"><span></span></div>
      <p class="scanner-hint">Apuntá al código de barras de la contratapa</p>
      <button class="btn scanner-close" type="button">Cancelar</button>`;
    document.body.appendChild(overlay);

    let done = false;
    let stopFn = () => {};
    const hint = overlay.querySelector(".scanner-hint");

    const finish = async (value) => {
      if (done) return;
      done = true;
      try { await stopFn(); } catch {}
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector(".scanner-close").onclick = () => finish(null);

    const handle = (code) => {
      const isbn = normalizeIsbn(code);
      if (isbn) { navigator.vibrate?.(60); finish(isbn); }
      else hint.textContent = "Ese código no parece un ISBN. Buscá el que empieza con 978.";
    };

    try {
      if (await nativeSupported()) {
        const video = overlay.querySelector("video");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false,
        });
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetector({ formats: ["ean_13"] });
        let timer;
        stopFn = () => { clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); };
        const tick = async () => {
          if (done) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]) handle(codes[0].rawValue);
          } catch {}
          timer = setTimeout(tick, 180);
        };
        tick();
      } else {
        overlay.querySelector("video").remove();
        await loadScript(FALLBACK_LIB);
        const scanner = new window.Html5Qrcode("scanner-view", {
          formatsToSupport: [window.Html5QrcodeSupportedFormats.EAN_13],
          verbose: false,
        });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 } },
          (text) => handle(text),
          () => {},
        );
        stopFn = () => scanner.stop();
      }
    } catch (err) {
      const denied = /Permission|NotAllowed/i.test(err?.name + err?.message);
      hint.textContent = denied
        ? "No hay permiso para usar la cámara. Habilitalo en el navegador o cargá el ISBN a mano."
        : "No se pudo abrir la cámara. Podés cargar el ISBN a mano.";
    }
  });
}
