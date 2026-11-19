// Configuración de la base de datos.
//
// Si estos dos valores están vacíos, la app funciona en "modo local":
// los datos se guardan solo en este navegador (sirve para probar).
//
// Para usar la base de datos real, copiá estos valores desde Supabase:
//   Project Settings → API → "Project URL" y la clave "anon public".
// La clave "anon" es pública por diseño: la seguridad la dan las reglas
// (Row Level Security) definidas en supabase/schema.sql.

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Opcional: clave gratuita de Google Books (console.cloud.google.com → APIs →
// "Books API" → Credenciales). Sin clave también funciona, pero comparte un
// cupo diario con todo el mundo y a veces se agota.
export const GOOGLE_BOOKS_KEY = "";
