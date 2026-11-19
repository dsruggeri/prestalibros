# PrestaLibros

Tu biblioteca personal y, sobre todo, el control de los libros que prestás:
a quién, desde cuándo, cuánto hace que lo tiene y cuándo conviene reclamarlo.

- Carga de libros escaneando el código de barras o escribiendo el ISBN
  (los datos y la portada se buscan solos en Google Books y Open Library).
- Préstamos con fecha y plazo; colores verde / amarillo / rojo según cuánto falta.
- Botón para reclamar por WhatsApp con el mensaje ya escrito.
- Historial por libro y por amigo.
- Pensada para el celular: se instala como app (PWA) y funciona con mala conexión.
- Datos en una base de datos real (Supabase), con login. Copia de seguridad en JSON.

No necesita instalar nada para desarrollarla: es HTML + CSS + JavaScript, sin compilación.

## Estructura

```
index.html            Página única de la app
css/app.css           Estilos (modo claro y oscuro)
js/app.js             Pantallas, navegación y lógica
js/db.js              Acceso a datos (Supabase o modo local)
js/isbn.js            Búsqueda de ediciones por ISBN
js/scanner.js         Escáner de código de barras
js/config.js          Claves de Supabase (y opcional Google Books)
supabase/schema.sql   Tablas y reglas de seguridad
sw.js, manifest…      Lo necesario para instalarla en el celular
tools/servidor.ps1    Servidor local para probar en Windows
```

## Probar en la compu

```bash
powershell -ExecutionPolicy Bypass -File tools/servidor.ps1
```

y abrir http://localhost:5500. Mientras `js/config.js` no tenga las claves de Supabase,
funciona en **modo local** (los datos quedan solo en ese navegador).

## Ponerla online

### 1. Base de datos (Supabase, gratis)
1. Crear cuenta en https://supabase.com y un proyecto nuevo (región São Paulo).
2. En **SQL Editor → New query**, pegar `supabase/schema.sql` y tocar **Run**.
3. En **Project Settings → API**, copiar la **Project URL** y la clave **anon public**
   en `js/config.js`. (La clave anon es pública por diseño; la seguridad la dan las
   reglas del esquema: cada usuario solo ve sus propios datos.)

### 2. Publicar (GitHub Pages, gratis)
1. Crear un repositorio en GitHub (por ejemplo `prestalibros`) y subir esta carpeta.
2. En el repo: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
3. A los minutos queda en `https://<usuario>.github.io/prestalibros/`.

### 3. Últimos ajustes en Supabase
1. **Authentication → URL Configuration**: poner la dirección de GitHub Pages como
   *Site URL* (para que el mail de confirmación vuelva a la app).
2. Entrar a la app, tocar **Crear cuenta**, confirmar el mail.
3. Como por ahora es de uso personal: **Authentication → Sign In / Providers →
   desactivar "Allow new users to sign up"**. Para sumar usuarios más adelante,
   alcanza con volver a activarlo: las tablas ya separan los datos de cada uno.

### 4. En el celular
Abrir la dirección en Chrome (Android) o Safari (iPhone) → menú → **Agregar a
pantalla de inicio**. Queda como una app más, con su ícono.

## Ideas para más adelante
- Recordatorio automático por mail de los préstamos vencidos (función programada en Supabase).
- Compartir la lista de libros con amigos para que te pidan prestado.
- Estadísticas: quién devuelve más rápido, libros más prestados.
