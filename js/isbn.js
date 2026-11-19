// Búsqueda de datos de una edición a partir del ISBN.
// Consulta Google Books y Open Library en paralelo y combina lo que encuentre.

import { GOOGLE_BOOKS_KEY } from "./config.js";

export function cleanIsbn(s = "") {
  return s.toUpperCase().replace(/[^0-9X]/g, "");
}

function valid10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : +s[i]) * (10 - i);
  return sum % 11 === 0;
}
function valid13(s) {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += +s[i] * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}
function to13(s10) {
  const core = "978" + s10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += +core[i] * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}

// Devuelve el ISBN-13 normalizado, o null si no es válido.
export function normalizeIsbn(input) {
  const s = cleanIsbn(input);
  if (valid13(s) && /^97[89]/.test(s)) return s;
  if (valid10(s)) return to13(s);
  return null;
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const year = (s) => {
  const m = String(s || "").match(/\d{4}/);
  return m ? +m[0] : null;
};

async function fromGoogle(isbn) {
  const key = GOOGLE_BOOKS_KEY ? `&key=${encodeURIComponent(GOOGLE_BOOKS_KEY)}` : "";
  const d = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key}`);
  const v = d.items?.[0]?.volumeInfo;
  if (!v) return null;
  let cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || "";
  cover = cover.replace(/^http:/, "https:").replace("&edge=curl", "");
  return {
    titulo: [v.title, v.subtitle].filter(Boolean).join(": "),
    autores: (v.authors || []).join(", "),
    editorial: v.publisher || "",
    anio: year(v.publishedDate),
    portada_url: cover,
  };
}

async function fromOpenLibrary(isbn) {
  const key = `ISBN:${isbn}`;
  const d = await getJson(`https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`);
  const v = d[key];
  if (!v) return null;
  return {
    titulo: [v.title, v.subtitle].filter(Boolean).join(": "),
    autores: (v.authors || []).map((a) => a.name).join(", "),
    editorial: (v.publishers || []).map((p) => p.name).join(", "),
    anio: year(v.publish_date),
    portada_url: v.cover?.large || v.cover?.medium || "",
  };
}

// Devuelve { isbn, titulo, autores, editorial, anio, portada_url } o null.
export async function lookupIsbn(isbn) {
  const [g, o] = await Promise.allSettled([fromGoogle(isbn), fromOpenLibrary(isbn)]);
  const a = g.status === "fulfilled" ? g.value : null;
  const b = o.status === "fulfilled" ? o.value : null;
  if (!a && !b) return null;
  const pick = (k) => a?.[k] || b?.[k] || "";
  return {
    isbn,
    titulo: pick("titulo"),
    autores: pick("autores"),
    editorial: pick("editorial"),
    anio: a?.anio || b?.anio || null,
    // Open Library suele tener portadas más grandes; Google cubre más ediciones.
    // Último recurso: el archivo de portadas de Open Library por ISBN
    // (si no existe, la app muestra una portada generada).
    portada_url: b?.portada_url || a?.portada_url ||
      `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
  };
}
