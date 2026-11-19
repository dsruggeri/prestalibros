// ── HTML seguro ──────────────────────────────────────────────────────────
// html`...` escapa automáticamente todo lo que se interpola, salvo que ya
// sea un fragmento creado con html`` o raw(). Así nunca se ejecuta código
// que venga dentro de un título, un nombre o una nota.

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new Safe(s);

function render(v) {
  if (v == null || v === false) return "";
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Safe(out);
}

// ── Fechas (siempre "YYYY-MM-DD", en hora local) ────────────────────────
const DAY = 86400000;

export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const today = () => isoDate();
export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}
export const daysSince = (iso) => daysBetween(iso, today());

export function fmtDate(iso, withYear = true) {
  if (!iso) return "";
  const d = parseDate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    ...(withYear && !sameYear ? { year: "numeric" } : {}),
  }).replace(".", "");
}

export function hace(dias) {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 60) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} meses`;
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ── Varios ───────────────────────────────────────────────────────────────
export function hue(str = "") {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function normalize(s = "") {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

// ── Toast ────────────────────────────────────────────────────────────────
let toastTimer;
export function toast(msg, kind = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2800);
}

// ── Hoja inferior (bottom sheet) ─────────────────────────────────────────
// openSheet(contenido, alMontar) muestra un <dialog>. Devuelve close().
export function openSheet(content, onMount) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.innerHTML = `<div class="sheet-grip"></div>${content}`;
  document.body.appendChild(dlg);
  const close = () => {
    dlg.classList.add("closing");
    setTimeout(() => { dlg.close(); dlg.remove(); }, 180);
  };
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  dlg.showModal();
  onMount?.(dlg, close);
  return close;
}

export function confirmSheet({ title, text = "", ok = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const close = openSheet(String(html`
      <h2 class="sheet-title">${title}</h2>
      ${text ? html`<p class="muted">${text}</p>` : ""}
      <div class="sheet-actions">
        <button class="btn ghost" data-no>Cancelar</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-yes>${ok}</button>
      </div>`), (dlg) => {
      dlg.querySelector("[data-yes]").onclick = () => { answered = true; resolve(true); close(); };
      dlg.querySelector("[data-no]").onclick = () => { answered = true; resolve(false); close(); };
      dlg.addEventListener("close", () => { if (!answered) resolve(false); });
    });
  });
}
