-- PrestaLibros · esquema de base de datos para Supabase (Postgres)
-- Cómo usarlo: en tu proyecto de Supabase abrí "SQL Editor" → "New query",
-- pegá todo este archivo y tocá "Run". Se puede correr más de una vez sin romper nada.

create extension if not exists pgcrypto;

-- ── Libros ────────────────────────────────────────────────────────────────
create table if not exists public.libros (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  isbn         text,
  titulo       text not null check (length(trim(titulo)) > 0),
  autores      text,
  editorial    text,
  anio         int,
  portada_url  text,
  notas        text,
  creado_en    timestamptz not null default now()
);

-- ── Contactos (a quién le prestás) ───────────────────────────────────────
create table if not exists public.contactos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre     text not null check (length(trim(nombre)) > 0),
  telefono   text,
  email      text,
  notas      text,
  creado_en  timestamptz not null default now()
);

-- ── Préstamos ────────────────────────────────────────────────────────────
-- Un libro está prestado si tiene un préstamo con fecha_devolucion vacía.
-- Los préstamos devueltos quedan como historial.
create table if not exists public.prestamos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  libro_id          uuid not null references public.libros (id) on delete cascade,
  contacto_id       uuid not null references public.contactos (id) on delete restrict,
  fecha_prestamo    date not null default current_date,
  fecha_limite      date,
  fecha_devolucion  date,
  notas             text,
  creado_en         timestamptz not null default now(),
  check (fecha_devolucion is null or fecha_devolucion >= fecha_prestamo)
);

-- Un mismo libro no puede estar prestado dos veces a la vez.
create unique index if not exists prestamos_un_activo_por_libro
  on public.prestamos (libro_id) where fecha_devolucion is null;

create index if not exists libros_user_idx    on public.libros (user_id);
create index if not exists contactos_user_idx on public.contactos (user_id);
create index if not exists prestamos_user_idx on public.prestamos (user_id);

-- ── Seguridad: cada usuario ve y toca solo lo suyo ──────────────────────
alter table public.libros    enable row level security;
alter table public.contactos enable row level security;
alter table public.prestamos enable row level security;

drop policy if exists "dueño" on public.libros;
create policy "dueño" on public.libros
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "dueño" on public.contactos;
create policy "dueño" on public.contactos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "dueño" on public.prestamos;
create policy "dueño" on public.prestamos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
