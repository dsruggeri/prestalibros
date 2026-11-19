// Capa de datos. Misma interfaz para los dos modos:
//  - "remote": Supabase (base de datos real, accesible desde cualquier dispositivo)
//  - "local":  localStorage (solo este navegador; para probar sin configurar nada)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { uuid } from "./util.js";
import { blobToDataUrl } from "./imagen.js";

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
export const TABLES = ["contactos", "libros", "prestamos"];
export const mode = SUPABASE_URL && SUPABASE_ANON_KEY ? "remote" : "local";

let sb = null;

export async function init() {
  if (mode !== "remote") return;
  const { createClient } = await import(SUPABASE_JS);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

// ── Errores en castellano ────────────────────────────────────────────────
function friendly(err) {
  const msg = err?.message || String(err);
  const code = err?.code;
  if (code === "23505") return new Error("Ese libro ya está prestado.");
  if (code === "23503") return new Error("No se puede borrar: tiene préstamos asociados.");
  if (/Invalid login credentials/i.test(msg)) return new Error("Email o contraseña incorrectos.");
  if (/Email not confirmed/i.test(msg)) return new Error("Tenés que confirmar tu email: revisá tu correo.");
  if (/already registered/i.test(msg)) return new Error("Ya existe una cuenta con ese email.");
  if (/Password should be/i.test(msg)) return new Error("La contraseña tiene que tener al menos 6 caracteres.");
  if (/Signups not allowed/i.test(msg)) return new Error("No se permiten cuentas nuevas.");
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error("Sin conexión. Probá de nuevo en un rato.");
  return new Error(msg);
}

// ── Autenticación ────────────────────────────────────────────────────────
export async function getUser() {
  if (mode === "local") return { email: "Modo local", local: true };
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw friendly(error);
  return { user: data.user, needsConfirm: !data.session };
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
}

export function onAuthChange(cb) {
  sb?.auth.onAuthStateChange((event) => cb(event));
}

// ── Modo local (localStorage) ────────────────────────────────────────────
const KEY = "prestalibros:datos:v1";
const empty = () => ({ libros: [], contactos: [], prestamos: [] });

function load() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return empty(); }
}
function persist(d) { localStorage.setItem(KEY, JSON.stringify(d)); }

// ── Operaciones ──────────────────────────────────────────────────────────
export async function fetchAll() {
  if (mode === "local") return load();
  const res = await Promise.all(TABLES.map((t) =>
    sb.from(t).select("*").order("creado_en", { ascending: true })));
  const out = {};
  res.forEach(({ data, error }, i) => {
    if (error) throw friendly(error);
    out[TABLES[i]] = data;
  });
  return out;
}

const clean = ({ user_id, ...row }) => row;

export async function insert(table, row) {
  if (mode === "local") {
    const d = load();
    if (table === "prestamos" && !row.fecha_devolucion &&
        d.prestamos.some((p) => p.libro_id === row.libro_id && !p.fecha_devolucion)) {
      throw new Error("Ese libro ya está prestado.");
    }
    const full = { ...row, id: row.id || uuid(), creado_en: row.creado_en || new Date().toISOString() };
    d[table].push(full);
    persist(d);
    return full;
  }
  const { data, error } = await sb.from(table).insert(clean(row)).select().single();
  if (error) throw friendly(error);
  return data;
}

export async function update(table, id, patch) {
  if (mode === "local") {
    const d = load();
    const i = d[table].findIndex((r) => r.id === id);
    if (i < 0) throw new Error("No se encontró el registro.");
    d[table][i] = { ...d[table][i], ...patch, id };
    persist(d);
    return d[table][i];
  }
  const { data, error } = await sb.from(table).update(clean(patch)).eq("id", id).select().single();
  if (error) throw friendly(error);
  return data;
}

export async function remove(table, id) {
  if (mode === "local") {
    const d = load();
    if (table === "contactos" && d.prestamos.some((p) => p.contacto_id === id)) {
      throw new Error("No se puede borrar: tiene préstamos asociados.");
    }
    d[table] = d[table].filter((r) => r.id !== id);
    if (table === "libros") d.prestamos = d.prestamos.filter((p) => p.libro_id !== id);
    persist(d);
    return;
  }
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw friendly(error);
}

// ── Fotos de portada ─────────────────────────────────────────────────────
const BUCKET = "portadas";
const PUBLIC_MARK = `/storage/v1/object/public/${BUCKET}/`;

// Sube una portada (JPEG ya procesado) y devuelve su URL.
export async function uploadCover(blob) {
  if (mode === "local") return blobToDataUrl(blob);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Tu sesión expiró. Volvé a entrar.");
  const path = `${session.user.id}/${uuid()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg", cacheControl: "31536000", upsert: false,
  });
  if (error) throw friendly(error);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Borra una portada subida por nosotros (ignora links externos y errores).
export async function removeCover(url) {
  if (mode === "local" || !url || !url.includes(PUBLIC_MARK)) return;
  const path = url.slice(url.indexOf(PUBLIC_MARK) + PUBLIC_MARK.length);
  try { await sb.storage.from(BUCKET).remove([path]); } catch {}
}

// Importa un backup (agrega o actualiza por id; no borra nada).
export async function importAll(data) {
  if (mode === "local") {
    const d = load();
    for (const t of TABLES) {
      for (const row of data[t] || []) {
        const i = d[t].findIndex((r) => r.id === row.id);
        if (i >= 0) d[t][i] = clean(row); else d[t].push(clean(row));
      }
    }
    persist(d);
    return;
  }
  for (const t of TABLES) {
    const rows = (data[t] || []).map(clean);
    if (!rows.length) continue;
    const { error } = await sb.from(t).upsert(rows);
    if (error) throw friendly(error);
  }
}
