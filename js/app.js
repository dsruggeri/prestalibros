import * as db from "./db.js";
import {
  html, raw, today, addDays, daysBetween, daysSince, fmtDate, hace, plural,
  hue, normalize, initials, toast, openSheet, confirmSheet,
} from "./util.js";
import { normalizeIsbn, cleanIsbn, lookupIsbn } from "./isbn.js";
import { scanIsbn } from "./scanner.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ═══ Ajustes (por dispositivo) ═══════════════════════════════════════════
const SETTINGS_KEY = "prestalibros:ajustes";
const settings = { plazo: 30 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
const PLAZOS = [7, 15, 30, 60, 90];

// ═══ Estado ══════════════════════════════════════════════════════════════
const state = { user: null, libros: [], contactos: [], prestamos: [] };
let libroById = new Map(), contactoById = new Map(), activoByLibro = new Map();

function reindex() {
  libroById = new Map(state.libros.map((l) => [l.id, l]));
  contactoById = new Map(state.contactos.map((c) => [c.id, c]));
  activoByLibro = new Map(state.prestamos.filter((p) => !p.fecha_devolucion).map((p) => [p.libro_id, p]));
}

async function refresh() {
  Object.assign(state, await db.fetchAll());
  reindex();
}

const FAIL = Symbol("fail");
// Ejecuta una operación, recarga los datos y vuelve a dibujar la pantalla.
async function run(fn, okMsg) {
  try {
    const r = await fn();
    await refresh();
    if (okMsg) toast(okMsg, "ok");
    render();
    return r;
  } catch (e) {
    console.error(e);
    toast(e.message || "Algo salió mal", "error");
    return FAIL;
  }
}

const activos = () => state.prestamos.filter((p) => !p.fecha_devolucion);

// ═══ Íconos ══════════════════════════════════════════════════════════════
const I = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10.5 8v8M14 8v8M17 8v8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};
const icon = (n) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`);

// ═══ Componentes ═════════════════════════════════════════════════════════
function cover(l, size = "") {
  return html`<div class="cover ${size}" style="--h:${hue(l.titulo)}">
    <div class="cover-ph"><span>${l.titulo}</span></div>
    ${l.portada_url ? html`<img src="${l.portada_url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
  </div>`;
}
// Si una portada falla o es un pixel vacío, queda la portada generada.
document.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG" && e.target.closest(".cover")) e.target.remove();
}, true);
document.addEventListener("load", (e) => {
  const img = e.target;
  if (img.tagName === "IMG" && img.closest(".cover") && img.naturalWidth < 10) img.remove();
}, true);

function avatar(c, size = "") {
  return html`<span class="avatar ${size}" style="--h:${hue(c.nombre)}">${initials(c.nombre)}</span>`;
}

function estado(p) {
  const dias = daysSince(p.fecha_prestamo);
  const limite = p.fecha_limite || addDays(p.fecha_prestamo, settings.plazo);
  const total = Math.max(1, daysBetween(p.fecha_prestamo, limite));
  const resta = daysBetween(today(), limite);
  let cls, label;
  if (resta < 0) { cls = "late"; label = `Vencido hace ${plural(-resta, "día", "días")}`; }
  else if (resta <= 7) { cls = "soon"; label = resta === 0 ? "Vence hoy" : `Vence en ${plural(resta, "día", "días")}`; }
  else { cls = "ok"; label = `Faltan ${resta} días`; }
  return { dias, resta, cls, label, limite, pct: Math.min(100, Math.max(3, Math.round((dias / total) * 100))) };
}
const byUrgency = (a, b) => estado(a).resta - estado(b).resta;

function waLink(p) {
  const l = libroById.get(p.libro_id);
  const c = contactoById.get(p.contacto_id);
  const nombre = (c?.nombre || "").split(" ")[0];
  const dias = daysSince(p.fecha_prestamo);
  const cuando = dias <= 1 ? hace(dias) : `${hace(dias)} (el ${fmtDate(p.fecha_prestamo)})`;
  const msg = `¡Hola ${nombre}! ¿Cómo va? Te escribo por "${l?.titulo}", que te presté ${cuando}. ` +
    `¿Me lo podrías devolver cuando lo termines? ¡Gracias! 📚`;
  const tel = (c?.telefono || "").replace(/\D/g, "");
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

function loanCard(p, { showFriend = true } = {}) {
  const l = libroById.get(p.libro_id);
  const c = contactoById.get(p.contacto_id);
  if (!l) return "";
  const e = estado(p);
  return html`<article class="loan ${e.cls}">
    <a class="loan-main" href="#/libro/${l.id}">
      ${cover(l, "xs")}
      <div class="loan-body">
        <strong class="clamp">${l.titulo}</strong>
        <span class="muted small">${showFriend ? html`${c?.nombre ?? "—"} · ` : ""}${hace(e.dias)}</span>
        <div class="bar"><span style="width:${e.pct}%"></span></div>
        <span class="badge ${e.cls}">${e.label}</span>
      </div>
    </a>
    <a class="icon-btn wa" href="${waLink(p)}" target="_blank" rel="noopener" aria-label="Pedírselo por WhatsApp" title="Pedírselo por WhatsApp">${icon("chat")}</a>
  </article>`;
}

function historyRow(p, { showBook = true, showFriend = true } = {}) {
  const l = libroById.get(p.libro_id);
  const c = contactoById.get(p.contacto_id);
  const dur = daysBetween(p.fecha_prestamo, p.fecha_devolucion || today());
  const href = showBook && l ? `#/libro/${l.id}` : c ? `#/amigo/${c.id}` : "#/";
  return html`<a class="row-item" href="${href}">
    ${showBook && l ? cover(l, "xs") : c ? avatar(c) : ""}
    <div class="grow">
      <strong class="clamp">${showBook ? l?.titulo : c?.nombre}</strong>
      <span class="muted small">${showBook && showFriend ? html`${c?.nombre ?? "—"} · ` : ""}${fmtDate(p.fecha_prestamo)} → ${p.fecha_devolucion ? fmtDate(p.fecha_devolucion) : "hoy"} · ${plural(dur, "día", "días")}</span>
    </div>
    ${icon("chevron")}
  </a>`;
}

const empty = (emoji, title, text, action = "") => html`<div class="empty">
  <div class="empty-emoji">${emoji}</div><h3>${title}</h3><p class="muted">${text}</p>${action}</div>`;

// ═══ Vistas ══════════════════════════════════════════════════════════════
function saludo() {
  const h = new Date().getHours();
  return h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

function viewInicio() {
  const act = activos().sort(byUrgency);
  const vencidos = act.filter((p) => estado(p).cls === "late").length;
  const recientes = [...state.libros].reverse().slice(0, 12);

  if (!state.libros.length) {
    return {
      title: "PrestaLibros", tab: "inicio",
      html: html`${empty("📚", "Tu biblioteca está vacía",
        "Empezá cargando tus libros. Lo más rápido es escanear el código de barras de la contratapa.",
        html`<div class="stack"><a class="btn primary" href="#/escanear">${icon("scan")} Escanear un libro</a>
             <a class="btn ghost" href="#/nuevo">Cargar a mano</a></div>`)}`,
    };
  }

  return {
    title: "PrestaLibros", tab: "inicio",
    html: html`
      <p class="eyebrow">${saludo()}</p>
      <div class="stats">
        <a href="#/libros" class="stat"><b>${state.libros.length}</b><span>${state.libros.length === 1 ? "libro" : "libros"}</span></a>
        <a href="#/prestamos" class="stat"><b>${act.length}</b><span>${act.length === 1 ? "prestado" : "prestados"}</span></a>
        <a href="#/prestamos" class="stat ${vencidos ? "late" : ""}"><b>${vencidos}</b><span>para reclamar</span></a>
      </div>

      <section>
        <div class="section-head"><h2>Afuera de casa</h2>${act.length ? html`<a href="#/prestamos" class="link">Ver todos</a>` : ""}</div>
        ${act.length
          ? html`<div class="list">${act.slice(0, 6).map((p) => loanCard(p))}</div>`
          : html`<p class="muted card pad">Todos tus libros están en casa. 🏠</p>`}
      </section>

      <section>
        <div class="section-head"><h2>Últimos que sumaste</h2><a href="#/libros" class="link">Biblioteca</a></div>
        <div class="shelf">${recientes.map((l) => html`<a href="#/libro/${l.id}" class="shelf-item">${cover(l, "sm")}</a>`)}</div>
      </section>

      <a class="btn ghost wide" href="#/escanear">${icon("scan")} Escanear otro libro</a>`,
  };
}

const libFilter = { q: "", f: "todos", orden: "titulo" };

function filteredLibros() {
  const q = normalize(libFilter.q.trim());
  let list = state.libros.filter((l) => {
    const prestado = activoByLibro.has(l.id);
    if (libFilter.f === "casa" && prestado) return false;
    if (libFilter.f === "prestados" && !prestado) return false;
    if (!q) return true;
    const c = prestado ? contactoById.get(activoByLibro.get(l.id).contacto_id)?.nombre : "";
    return normalize([l.titulo, l.autores, l.editorial, l.isbn, c].join(" ")).includes(q);
  });
  const coll = new Intl.Collator("es", { sensitivity: "base" });
  if (libFilter.orden === "titulo") list.sort((a, b) => coll.compare(a.titulo, b.titulo));
  if (libFilter.orden === "autor") list.sort((a, b) => coll.compare(a.autores || "~", b.autores || "~"));
  if (libFilter.orden === "recientes") list.reverse();
  return list;
}

function bookGrid() {
  const list = filteredLibros();
  if (!list.length) {
    return state.libros.length
      ? html`<p class="muted center pad">No hay libros que coincidan.</p>`
      : empty("📚", "Todavía no cargaste libros", "Tocá el + para agregar el primero.");
  }
  return html`<div class="grid">${list.map((l) => {
    const p = activoByLibro.get(l.id);
    return html`<a class="book" href="#/libro/${l.id}">
      ${cover(l)}
      ${p ? html`<span class="tag ${estado(p).cls}">${contactoById.get(p.contacto_id)?.nombre.split(" ")[0] ?? "Prestado"}</span>` : ""}
      <span class="book-title clamp">${l.titulo}</span>
      <span class="book-author clamp">${l.autores}</span>
    </a>`;
  })}</div>`;
}

function viewLibros() {
  const seg = (v, label) => html`<button type="button" class="seg ${libFilter.f === v ? "on" : ""}" data-f="${v}">${label}</button>`;
  return {
    title: "Biblioteca", tab: "libros",
    html: html`
      <div class="toolbar">
        <label class="search">${icon("search")}<input type="search" placeholder="Buscar título, autor, amigo…" value="${libFilter.q}" id="q"></label>
        <div class="toolbar-row">
          <div class="segmented">${seg("todos", "Todos")}${seg("casa", "En casa")}${seg("prestados", "Prestados")}</div>
          <select id="orden" aria-label="Ordenar">
            <option value="titulo" ${libFilter.orden === "titulo" ? "selected" : ""}>A–Z</option>
            <option value="autor" ${libFilter.orden === "autor" ? "selected" : ""}>Autor</option>
            <option value="recientes" ${libFilter.orden === "recientes" ? "selected" : ""}>Recientes</option>
          </select>
        </div>
      </div>
      <p class="muted small" id="count"></p>
      <div id="grid">${bookGrid()}</div>`,
    mount(root) {
      const upd = () => {
        $("#grid", root).innerHTML = String(bookGrid());
        const n = filteredLibros().length;
        $("#count", root).textContent = `${plural(n, "libro", "libros")}`;
      };
      upd();
      $("#q", root).addEventListener("input", (e) => { libFilter.q = e.target.value; upd(); });
      $("#orden", root).addEventListener("change", (e) => { libFilter.orden = e.target.value; upd(); });
      $$(".seg", root).forEach((b) => b.addEventListener("click", () => {
        libFilter.f = b.dataset.f;
        $$(".seg", root).forEach((x) => x.classList.toggle("on", x === b));
        upd();
      }));
    },
  };
}

function viewLibro(id) {
  const l = libroById.get(id);
  if (!l) return notFound("Ese libro ya no está en tu biblioteca.");
  const p = activoByLibro.get(id);
  const c = p && contactoById.get(p.contacto_id);
  const hist = state.prestamos.filter((x) => x.libro_id === id && x.fecha_devolucion)
    .sort((a, b) => b.fecha_prestamo.localeCompare(a.fecha_prestamo));
  const e = p && estado(p);

  return {
    title: "", back: "#/libros", tab: "libros",
    action: html`<a class="icon-btn" href="#/editar/${id}" aria-label="Editar">${icon("edit")}</a>`,
    html: html`
      <div class="detail-head">
        ${cover(l, "lg")}
        <div class="detail-info">
          <h2 class="detail-title">${l.titulo}</h2>
          ${l.autores ? html`<p class="detail-author">${l.autores}</p>` : ""}
          <dl class="meta">
            ${l.editorial ? html`<div><dt>Editorial</dt><dd>${l.editorial}</dd></div>` : ""}
            ${l.anio ? html`<div><dt>Año</dt><dd>${l.anio}</dd></div>` : ""}
            ${l.isbn ? html`<div><dt>ISBN</dt><dd>${l.isbn}</dd></div>` : ""}
          </dl>
        </div>
      </div>

      ${p ? html`
        <div class="status-card ${e.cls}">
          <p class="status-label">Prestado a</p>
          <a class="status-who" href="#/amigo/${c?.id}">${c ? avatar(c, "sm") : ""}<span>${c?.nombre ?? "—"}</span></a>
          <p class="status-big">${hace(e.dias)}</p>
          <p class="muted small">Desde el ${fmtDate(p.fecha_prestamo)} · ${e.label.toLowerCase()} (${fmtDate(e.limite)})</p>
          ${p.notas ? html`<p class="small note">“${p.notas}”</p>` : ""}
          <div class="bar"><span style="width:${e.pct}%"></span></div>
          <div class="btn-row">
            <button class="btn primary" data-act="devolver">${icon("check")} Me lo devolvió</button>
            <a class="btn wa-btn" href="${waLink(p)}" target="_blank" rel="noopener">${icon("chat")} Reclamar</a>
          </div>
        </div>` : html`
        <div class="status-card home">
          <p class="status-big">En tu biblioteca</p>
          <p class="muted small">${hist.length ? `Lo prestaste ${plural(hist.length, "vez", "veces")}.` : "Nunca lo prestaste."}</p>
          <div class="btn-row"><button class="btn primary" data-act="prestar">${icon("swap")} Prestar</button></div>
        </div>`}

      ${l.notas ? html`<section><h2 class="h-small">Notas</h2><p class="card pad prewrap">${l.notas}</p></section>` : ""}

      ${hist.length ? html`<section><h2 class="h-small">Préstamos anteriores</h2>
        <div class="card list-flat">${hist.map((x) => historyRow(x, { showBook: false }))}</div></section>` : ""}

      <div class="btn-row end">
        <a class="btn ghost" href="#/editar/${id}">${icon("edit")} Editar</a>
        <button class="btn ghost danger-text" data-act="borrar">${icon("trash")} Eliminar</button>
      </div>`,
    mount(root) {
      $("[data-act=prestar]", root)?.addEventListener("click", () => prestarSheet(l));
      $("[data-act=devolver]", root)?.addEventListener("click", () => devolverSheet(p));
      $("[data-act=borrar]", root).addEventListener("click", async () => {
        const ok = await confirmSheet({
          title: `¿Eliminar «${l.titulo}»?`,
          text: "Se borra el libro y todo su historial de préstamos. No se puede deshacer.",
          ok: "Eliminar", danger: true,
        });
        if (!ok) return;
        if (await run(() => db.remove("libros", id), "Libro eliminado") !== FAIL) location.replace("#/libros");
      });
    },
  };
}

function prestarSheet(libro) {
  const plazos = PLAZOS.includes(settings.plazo) ? PLAZOS : [...PLAZOS, settings.plazo].sort((a, b) => a - b);
  const recientes = [...new Map(
    [...state.prestamos].reverse().map((p) => [p.contacto_id, contactoById.get(p.contacto_id)]),
  ).values()].filter(Boolean).slice(0, 6);

  openSheet(String(html`
    <h2 class="sheet-title">Prestar «${libro.titulo}»</h2>
    <form class="form" id="prestar-form">
      <label>¿A quién?
        <input name="nombre" list="dl-contactos" required autocomplete="off" placeholder="Nombre de tu amigo/a">
      </label>
      <datalist id="dl-contactos">${state.contactos.map((c) => html`<option value="${c.nombre}">`)}</datalist>
      ${recientes.length ? html`<div class="chips">${recientes.map((c) =>
        html`<button type="button" class="chip" data-nombre="${c.nombre}">${c.nombre}</button>`)}</div>` : ""}
      <label class="phone-field" hidden>WhatsApp (opcional)
        <input name="telefono" type="tel" inputmode="tel" placeholder="+54 9 11 1234 5678">
      </label>
      <label>Fecha del préstamo
        <input name="fecha" type="date" value="${today()}" max="${today()}" required>
      </label>
      <fieldset><legend>¿Cuándo debería volver?</legend>
        <div class="chips">${plazos.map((d) => html`<label class="chip radio">
          <input type="radio" name="plazo" value="${d}" ${d === settings.plazo ? "checked" : ""}>
          <span>${d < 30 ? `${d} días` : d === 30 ? "1 mes" : `${Math.round(d / 30)} meses`}</span></label>`)}</div>
      </fieldset>
      <label>Nota (opcional)
        <input name="notas" placeholder="Ej.: se lo llevó de vacaciones">
      </label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Prestar</button>
      </div>
    </form>`), (dlg, close) => {
    const f = $("#prestar-form", dlg);
    const phone = $(".phone-field", dlg);
    const find = (n) => state.contactos.find((c) => normalize(c.nombre.trim()) === normalize(n.trim()));
    const sync = () => { phone.hidden = !f.nombre.value.trim() || !!find(f.nombre.value); };
    f.nombre.addEventListener("input", sync);
    $$("[data-nombre]", dlg).forEach((b) => b.addEventListener("click", () => {
      f.nombre.value = b.dataset.nombre; sync();
    }));
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nombre = f.nombre.value.trim();
      const fecha = f.fecha.value || today();
      const plazo = +f.plazo.value || settings.plazo;
      const btn = $("[type=submit]", f);
      btn.disabled = true;
      const r = await run(async () => {
        let c = find(nombre);
        if (!c) c = await db.insert("contactos", { nombre, telefono: f.telefono.value.trim() || null });
        await db.insert("prestamos", {
          libro_id: libro.id, contacto_id: c.id, fecha_prestamo: fecha,
          fecha_limite: addDays(fecha, plazo), notas: f.notas.value.trim() || null,
        });
      }, `Anotado: «${libro.titulo}» lo tiene ${nombre}`);
      if (r === FAIL) btn.disabled = false; else close();
    });
    setTimeout(() => f.nombre.focus(), 50);
  });
}

function devolverSheet(p) {
  const l = libroById.get(p.libro_id);
  const c = contactoById.get(p.contacto_id);
  openSheet(String(html`
    <h2 class="sheet-title">¿Volvió «${l.titulo}»?</h2>
    <p class="muted">${c?.nombre ?? "Tu amigo/a"} lo tiene desde el ${fmtDate(p.fecha_prestamo)} (${plural(daysSince(p.fecha_prestamo), "día", "días")}).</p>
    <form class="form" id="dev-form">
      <label>Fecha de devolución
        <input name="fecha" type="date" value="${today()}" min="${p.fecha_prestamo}" max="${today()}" required>
      </label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">${icon("check")} Sí, ya lo tengo</button>
      </div>
    </form>`), (dlg, close) => {
    $("#dev-form", dlg).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const r = await run(() => db.update("prestamos", p.id, { fecha_devolucion: ev.target.fecha.value || today() }),
        "¡Volvió a casa! 📚");
      if (r !== FAIL) close();
    });
  });
}

function viewForm(id, opts = {}) {
  const editing = id ? libroById.get(id) : null;
  if (id && !editing) return notFound("Ese libro ya no existe.");
  const l = editing || {};
  return {
    title: editing ? "Editar libro" : "Nuevo libro", tab: editing ? "libros" : "nuevo",
    back: editing ? `#/libro/${id}` : "#/",
    html: html`
      <form class="form" id="book-form" novalidate>
        ${!editing ? html`<button type="button" class="btn primary wide big" data-act="scan">${icon("scan")} Escanear código de barras</button>
          <div class="divider"><span>o cargá el ISBN</span></div>` : ""}
        <div class="isbn-row">
          <label class="grow">ISBN
            <input name="isbn" inputmode="numeric" autocomplete="off" placeholder="978…" value="${l.isbn || ""}">
          </label>
          <button type="button" class="btn ghost" data-act="buscar">${icon("search")} Buscar</button>
        </div>
        <div class="lookup" aria-live="polite"></div>

        <div class="form-cover">
          <div id="cover-preview"></div>
          <button type="button" class="link small" data-act="quitar-portada" hidden>Quitar portada</button>
        </div>

        <label>Título *
          <input name="titulo" required value="${l.titulo || ""}" placeholder="Rayuela">
        </label>
        <label>Autor/es
          <input name="autores" value="${l.autores || ""}" placeholder="Julio Cortázar">
        </label>
        <div class="grid2">
          <label>Editorial <input name="editorial" value="${l.editorial || ""}"></label>
          <label>Año <input name="anio" inputmode="numeric" maxlength="4" value="${l.anio || ""}"></label>
        </div>
        <label>Notas
          <textarea name="notas" rows="3" placeholder="Edición firmada, me lo regaló mi viejo…">${l.notas || ""}</textarea>
        </label>
        <input type="hidden" name="portada_url" value="${l.portada_url || ""}">

        <div class="form-actions">
          ${!editing ? html`<button type="submit" class="btn ghost" value="otro">Guardar y seguir</button>` : ""}
          <button type="submit" class="btn primary" value="ok">Guardar</button>
        </div>
      </form>`,
    mount(root) {
      const f = $("#book-form", root);
      const status = $(".lookup", root);
      const quitar = $("[data-act=quitar-portada]", root);
      const preview = () => {
        const titulo = f.titulo.value.trim() || "Sin título";
        $("#cover-preview", root).innerHTML = String(cover({ titulo, portada_url: f.portada_url.value }, "md"));
        quitar.hidden = !f.portada_url.value;
      };
      preview();
      f.titulo.addEventListener("input", preview);
      quitar.addEventListener("click", () => { f.portada_url.value = ""; preview(); });

      let lastLooked = "";
      const lookup = async (isbn) => {
        if (!isbn || isbn === lastLooked) return;
        lastLooked = isbn;
        f.isbn.value = isbn;
        const dup = state.libros.find((x) => x.isbn === isbn && x.id !== id);
        status.className = "lookup busy";
        status.textContent = "Buscando datos de la edición…";
        const data = await lookupIsbn(isbn).catch(() => null);
        if (f.isbn.value !== isbn) return;
        if (data) {
          for (const k of ["titulo", "autores", "editorial", "anio", "portada_url"]) {
            if (data[k] && (!editing || !f[k].value)) f[k].value = data[k];
          }
          preview();
          status.className = "lookup ok";
          status.textContent = "¡Encontrado! Revisá los datos y guardá.";
        } else {
          status.className = "lookup warn";
          status.textContent = "No encontré esa edición en internet. Completá los datos a mano.";
          f.titulo.focus();
        }
        if (dup) {
          status.className = "lookup warn";
          status.innerHTML = String(html`Ojo: ya tenés este libro cargado. <a href="#/libro/${dup.id}">Ver «${dup.titulo}»</a>`);
        }
      };

      const tryIsbn = () => {
        const isbn = normalizeIsbn(f.isbn.value);
        if (isbn) lookup(isbn);
        return isbn;
      };
      f.isbn.addEventListener("input", () => {
        const c = cleanIsbn(f.isbn.value);
        if (c.length === 10 || c.length === 13) tryIsbn();
      });
      $("[data-act=buscar]", root).addEventListener("click", () => {
        lastLooked = "";
        if (!tryIsbn()) {
          status.className = "lookup warn";
          status.textContent = "Ese ISBN no es válido. Revisá los números (son 10 o 13).";
        }
      });
      const scan = async () => {
        const isbn = await scanIsbn();
        if (isbn) { lastLooked = ""; lookup(isbn); }
      };
      $("[data-act=scan]", root)?.addEventListener("click", scan);
      if (opts.scan) scan();

      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const titulo = f.titulo.value.trim();
        if (!titulo) { f.titulo.focus(); toast("Falta el título", "error"); return; }
        const anio = parseInt(f.anio.value, 10);
        const raw = f.isbn.value.trim();
        const row = {
          isbn: raw ? normalizeIsbn(raw) || cleanIsbn(raw) : null,
          titulo,
          autores: f.autores.value.trim() || null,
          editorial: f.editorial.value.trim() || null,
          anio: anio > 0 && anio < 3000 ? anio : null,
          portada_url: f.portada_url.value || null,
          notas: f.notas.value.trim() || null,
        };
        const otro = ev.submitter?.value === "otro";
        $$("[type=submit]", f).forEach((b) => (b.disabled = true));
        const saved = await run(() => editing ? db.update("libros", id, row) : db.insert("libros", row),
          editing ? "Cambios guardados" : `«${titulo}» ya está en tu biblioteca`);
        if (saved === FAIL) { $$("[type=submit]", f).forEach((b) => (b.disabled = false)); return; }
        if (otro) {
          // run() ya volvió a dibujar el formulario vacío
          $("[name=isbn]")?.focus();
        } else {
          location.replace(`#/libro/${saved.id}`);
        }
      });
    },
  };
}

const loanTab = { t: "activos" };
function viewPrestamos() {
  const act = activos().sort(byUrgency);
  const hist = state.prestamos.filter((p) => p.fecha_devolucion)
    .sort((a, b) => b.fecha_devolucion.localeCompare(a.fecha_devolucion));
  const prom = hist.length
    ? Math.round(hist.reduce((s, p) => s + daysBetween(p.fecha_prestamo, p.fecha_devolucion), 0) / hist.length)
    : null;
  const t = loanTab.t;
  return {
    title: "Préstamos", tab: "prestamos",
    html: html`
      <div class="segmented full">
        <button class="seg ${t === "activos" ? "on" : ""}" data-t="activos">Prestados (${act.length})</button>
        <button class="seg ${t === "historial" ? "on" : ""}" data-t="historial">Devueltos (${hist.length})</button>
      </div>
      ${t === "activos"
        ? act.length
          ? html`<div class="list">${act.map((p) => loanCard(p))}</div>
                 <p class="muted small center">El color indica cuánto falta para la fecha pactada. Tocá ${icon("chat")} para reclamarlo por WhatsApp.</p>`
          : empty("🏠", "Ningún libro afuera", "Cuando prestes uno, vas a ver acá cuánto hace que lo tiene cada uno.")
        : hist.length
          ? html`${prom != null ? html`<p class="muted small">En promedio, tus libros vuelven en ${plural(prom, "día", "días")}.</p>` : ""}
                 <div class="card list-flat">${hist.map((p) => historyRow(p))}</div>`
          : empty("🗂️", "Sin historial todavía", "Acá van a quedar los préstamos que ya te devolvieron.")}`,
    mount(root) {
      $$(".seg", root).forEach((b) => b.addEventListener("click", () => { loanTab.t = b.dataset.t; render(); }));
    },
  };
}

function viewAmigos() {
  const coll = new Intl.Collator("es", { sensitivity: "base" });
  const list = [...state.contactos].sort((a, b) => coll.compare(a.nombre, b.nombre));
  return {
    title: "Amigos", tab: "amigos",
    html: html`
      <button class="btn ghost wide" data-act="nuevo">${icon("plus")} Agregar amigo/a</button>
      ${list.length ? html`<div class="card list-flat">${list.map((c) => {
        const ps = state.prestamos.filter((p) => p.contacto_id === c.id);
        const a = ps.filter((p) => !p.fecha_devolucion);
        const late = a.some((p) => estado(p).cls === "late");
        return html`<a class="row-item" href="#/amigo/${c.id}">
          ${avatar(c)}
          <div class="grow"><strong>${c.nombre}</strong>
            <span class="muted small">${a.length ? `Tiene ${plural(a.length, "libro tuyo", "libros tuyos")}` : "No tiene libros tuyos"} · ${plural(ps.length, "préstamo", "préstamos")} en total</span></div>
          ${late ? html`<span class="dot late" title="Tiene un préstamo vencido"></span>` : ""}
          ${icon("chevron")}
        </a>`;
      })}</div>` : empty("👋", "Todavía no hay nadie", "Los amigos se agregan solos cuando prestás un libro, o podés cargarlos acá.")}`,
    mount(root) { $("[data-act=nuevo]", root).addEventListener("click", () => contactoSheet()); },
  };
}

function viewAmigo(id) {
  const c = contactoById.get(id);
  if (!c) return notFound("No encontré a esa persona.");
  const ps = state.prestamos.filter((p) => p.contacto_id === id);
  const act = ps.filter((p) => !p.fecha_devolucion).sort(byUrgency);
  const hist = ps.filter((p) => p.fecha_devolucion).sort((a, b) => b.fecha_devolucion.localeCompare(a.fecha_devolucion));
  const tel = (c.telefono || "").replace(/[^\d+]/g, "");
  return {
    title: "", back: "#/amigos", tab: "amigos",
    action: html`<button class="icon-btn" data-act="editar" aria-label="Editar">${icon("edit")}</button>`,
    html: html`
      <div class="person">
        ${avatar(c, "lg")}
        <h2 class="detail-title">${c.nombre}</h2>
        ${c.telefono || c.email ? html`<p class="muted">${[c.telefono, c.email].filter(Boolean).join(" · ")}</p>` : ""}
        ${c.notas ? html`<p class="small note">${c.notas}</p>` : ""}
        <div class="btn-row center">
          ${tel ? html`<a class="btn ghost" href="tel:${tel}">${icon("phone")} Llamar</a>
                      <a class="btn wa-btn" href="https://wa.me/${tel.replace(/\D/g, "")}" target="_blank" rel="noopener">${icon("chat")} WhatsApp</a>`
                : html`<button class="btn ghost" data-act="editar">${icon("phone")} Agregar teléfono</button>`}
        </div>
      </div>
      <section><h2 class="h-small">Tiene ahora</h2>
        ${act.length ? html`<div class="list">${act.map((p) => loanCard(p, { showFriend: false }))}</div>`
          : html`<p class="muted card pad">Nada tuyo. 👌</p>`}
      </section>
      ${hist.length ? html`<section><h2 class="h-small">Le prestaste antes</h2>
        <div class="card list-flat">${hist.map((p) => historyRow(p, { showFriend: false }))}</div></section>` : ""}
      <div class="btn-row end">
        <button class="btn ghost danger-text" data-act="borrar" ${ps.length ? "disabled" : ""}
          title="${ps.length ? "No se puede borrar alguien con préstamos registrados" : ""}">${icon("trash")} Eliminar</button>
      </div>`,
    mount(root) {
      $$("[data-act=editar]").forEach((b) => b.addEventListener("click", () => contactoSheet(c)));
      $("[data-act=borrar]", root).addEventListener("click", async () => {
        if (!(await confirmSheet({ title: `¿Eliminar a ${c.nombre}?`, ok: "Eliminar", danger: true }))) return;
        if (await run(() => db.remove("contactos", id), "Eliminado") !== FAIL) location.replace("#/amigos");
      });
    },
  };
}

function contactoSheet(c = null) {
  openSheet(String(html`
    <h2 class="sheet-title">${c ? "Editar" : "Nuevo amigo/a"}</h2>
    <form class="form" id="c-form">
      <label>Nombre *<input name="nombre" required value="${c?.nombre || ""}"></label>
      <label>WhatsApp / teléfono<input name="telefono" type="tel" inputmode="tel" placeholder="+54 9 11 1234 5678" value="${c?.telefono || ""}"></label>
      <p class="hint">Con código de país (+54 9…) para que funcione el botón de WhatsApp.</p>
      <label>Email<input name="email" type="email" value="${c?.email || ""}"></label>
      <label>Notas<input name="notas" value="${c?.notas || ""}" placeholder="Ej.: compañero del club de lectura"></label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>`), (dlg, close) => {
    $("#c-form", dlg).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const row = {
        nombre: f.nombre.value.trim(),
        telefono: f.telefono.value.trim() || null,
        email: f.email.value.trim() || null,
        notas: f.notas.value.trim() || null,
      };
      if (!row.nombre) return;
      const r = await run(() => c ? db.update("contactos", c.id, row) : db.insert("contactos", row), "Guardado");
      if (r !== FAIL) close();
    });
  });
}

function viewAjustes() {
  const local = db.mode === "local";
  return {
    title: "Ajustes", back: "#/", action: "",
    html: html`
      <section class="card pad">
        <h2 class="h-small">Cuenta</h2>
        ${local
          ? html`<p class="notice">Estás en <b>modo local</b>: los datos se guardan solo en este navegador.
              Para tenerlos en la nube y verlos desde el celular, configurá Supabase (ver README).</p>`
          : html`<p>Conectado como <b>${state.user?.email}</b></p>
              <p class="muted small">Tus datos se guardan en la base de datos y se sincronizan entre dispositivos.</p>
              <button class="btn ghost" data-act="salir">${icon("logout")} Cerrar sesión</button>`}
      </section>

      <section class="card pad">
        <h2 class="h-small">Plazo sugerido de préstamo</h2>
        <p class="muted small">Es el que aparece elegido por defecto al prestar.</p>
        <div class="chips">${PLAZOS.map((d) => html`<label class="chip radio">
          <input type="radio" name="plazo" value="${d}" ${d === settings.plazo ? "checked" : ""}>
          <span>${d < 30 ? `${d} días` : d === 30 ? "1 mes" : `${Math.round(d / 30)} meses`}</span></label>`)}</div>
      </section>

      <section class="card pad">
        <h2 class="h-small">Copia de seguridad</h2>
        <p class="muted small">Descargá todos tus datos en un archivo, o recuperalos desde uno.</p>
        <div class="btn-row">
          <button class="btn ghost" data-act="exportar">${icon("download")} Descargar</button>
          <label class="btn ghost">${icon("upload")} Importar<input type="file" accept="application/json,.json" hidden id="import-file"></label>
        </div>
      </section>

      <p class="muted small center">PrestaLibros · ${plural(state.libros.length, "libro", "libros")} · ${plural(state.contactos.length, "amigo", "amigos")} · ${plural(state.prestamos.length, "préstamo", "préstamos")}</p>`,
    mount(root) {
      $$("[name=plazo]", root).forEach((r) => r.addEventListener("change", () => {
        settings.plazo = +r.value; saveSettings(); toast("Plazo actualizado", "ok");
      }));
      $("[data-act=salir]", root)?.addEventListener("click", async () => {
        await db.signOut();
        state.user = null;
        location.hash = "#/";
        render();
      });
      $("[data-act=exportar]", root).addEventListener("click", () => {
        const data = { app: "prestalibros", version: 1, exportado: new Date().toISOString(),
          libros: state.libros, contactos: state.contactos, prestamos: state.prestamos };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = `prestalibros-${today()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      $("#import-file", root).addEventListener("change", async (ev) => {
        const file = ev.target.files[0];
        ev.target.value = "";
        if (!file) return;
        let data;
        try { data = JSON.parse(await file.text()); } catch { return toast("Ese archivo no es una copia válida", "error"); }
        if (data?.app !== "prestalibros") return toast("Ese archivo no es una copia de PrestaLibros", "error");
        const ok = await confirmSheet({
          title: "¿Importar esta copia?",
          text: `Trae ${plural(data.libros?.length || 0, "libro", "libros")}, ${plural(data.contactos?.length || 0, "amigo", "amigos")} y ${plural(data.prestamos?.length || 0, "préstamo", "préstamos")}. Lo que ya tenés no se borra.`,
          ok: "Importar",
        });
        if (ok) await run(() => db.importAll(data), "Copia importada");
      });
    },
  };
}

function notFound(msg) {
  return { title: "", back: "#/", html: empty("🤷", "No está", msg, html`<a class="btn ghost" href="#/">Ir al inicio</a>`) };
}

// ═══ Login ═══════════════════════════════════════════════════════════════
function renderLogin() {
  document.body.classList.add("auth");
  let signup = false;
  const main = $("#view");
  main.innerHTML = String(html`
    <div class="auth-card">
      <div class="auth-logo">${icon("book")}</div>
      <h1>PrestaLibros</h1>
      <p class="muted">Tu biblioteca, y quién tiene cada libro.</p>
      <form class="form" id="auth-form">
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Contraseña<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="btn primary wide" type="submit">Entrar</button>
        <p class="auth-msg" aria-live="polite"></p>
      </form>
      <button class="link small" data-act="toggle">¿Primera vez? Crear cuenta</button>
    </div>`);
  const f = $("#auth-form", main);
  const msg = $(".auth-msg", main);
  const toggle = $("[data-act=toggle]", main);
  const btn = $("[type=submit]", f);
  toggle.addEventListener("click", () => {
    signup = !signup;
    btn.textContent = signup ? "Crear cuenta" : "Entrar";
    toggle.textContent = signup ? "Ya tengo cuenta" : "¿Primera vez? Crear cuenta";
    f.password.autocomplete = signup ? "new-password" : "current-password";
    msg.textContent = "";
  });
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    btn.disabled = true;
    msg.className = "auth-msg";
    msg.textContent = signup ? "Creando cuenta…" : "Entrando…";
    try {
      if (signup) {
        const r = await db.signUp(f.email.value.trim(), f.password.value);
        if (r.needsConfirm) {
          msg.className = "auth-msg ok";
          msg.textContent = "Listo. Te mandamos un mail: confirmá la cuenta y después entrá acá.";
          signup = true; toggle.click();
          btn.disabled = false;
          return;
        }
      } else {
        await db.signIn(f.email.value.trim(), f.password.value);
      }
      state.user = await db.getUser();
      await refresh();
      location.hash = "#/";
      render();
    } catch (e) {
      msg.className = "auth-msg error";
      msg.textContent = e.message;
      btn.disabled = false;
    }
  });
}

// ═══ Router ══════════════════════════════════════════════════════════════
const routes = [
  [/^$/, () => viewInicio()],
  [/^libros$/, () => viewLibros()],
  [/^libro\/([\w-]+)$/, (id) => viewLibro(id)],
  [/^nuevo$/, () => viewForm(null)],
  [/^escanear$/, () => viewForm(null, { scan: true })],
  [/^editar\/([\w-]+)$/, (id) => viewForm(id)],
  [/^prestamos$/, () => viewPrestamos()],
  [/^amigos$/, () => viewAmigos()],
  [/^amigo\/([\w-]+)$/, (id) => viewAmigo(id)],
  [/^ajustes$/, () => viewAjustes()],
];

let lastPath = null;
let navDepth = 0;

function render() {
  if (!state.user) return renderLogin();
  document.body.classList.remove("auth");
  const path = location.hash.replace(/^#\/?/, "");
  const match = routes.map(([re, fn]) => [path.match(re), fn]).find(([m]) => m);
  if (!match) { location.replace("#/"); return; }
  const [m, fn] = match;
  const v = fn(...m.slice(1));

  $("#title").textContent = v.title;
  const back = $("#back");
  back.hidden = !v.back;
  back.onclick = () => (navDepth > 0 ? history.back() : location.replace(v.back));
  const act = $("#header-action");
  act.innerHTML = v.action !== undefined ? String(v.action)
    : String(html`<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${icon("settings")}</a>`);
  $$(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === v.tab));

  const main = $("#view");
  main.innerHTML = String(v.html);
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
  v.mount?.(main);
}

// ═══ Arranque ════════════════════════════════════════════════════════════
async function boot() {
  $$(".tabbar [data-icon]").forEach((el) => { el.innerHTML = String(icon(el.dataset.icon)); });
  $("#back").innerHTML = String(icon("back"));
  try {
    await db.init();
    state.user = await db.getUser();
    if (state.user) await refresh();
  } catch (e) {
    console.error(e);
    $("#view").innerHTML = String(empty("⚠️", "No pude conectarme", e.message,
      html`<button class="btn primary" onclick="location.reload()">Reintentar</button>`));
    return;
  }
  db.onAuthChange(async (event) => {
    if (event === "SIGNED_OUT") {
      Object.assign(state, { user: null, libros: [], contactos: [], prestamos: [] });
      reindex();
      render();
    }
  });
  window.addEventListener("hashchange", () => { navDepth++; render(); });
  render();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
