# Diseño — Backend multiusuario, login, importación de CSV y multi-cuenta

- **Fecha:** 2026-07-23 (v2: 2026-07-30 — añadido multi-cuenta, modos de drawdown y presets)
- **Proyecto:** Apex Dashboard (cuentas de fondeo Apex Trader Funding — cualquier tamaño/tipo)
- **Estado:** Aprobado el diseño en conversación; pendiente de revisión del spec escrito v2.

## 1. Objetivo y contexto

La app actual es 100% cliente (React + Vite + Zustand) y persiste en `localStorage`. Se pide:

1. **Importación de un CSV** exportado desde la plataforma de trading (fills de órdenes).
2. **Base de datos Postgres** en lugar de `localStorage`.
3. **Login** con **registro público** (varios usuarios reales, cada uno con sus datos aislados).
4. **(v2) Multi-cuenta:** cada usuario puede guardar **varias cuentas** de fondeo y cambiar entre
   ellas con un selector. Cada cuenta declara su **tipo** (modo de drawdown) y su **tamaño**, con
   valores **precargados desde un preset pero totalmente editables**.

Decisiones tomadas en el brainstorming:

- **Stack backend:** backend propio **Node + Fastify + Postgres + JWT** (elegido por el usuario sobre
  Supabase y Next.js, asumiendo el mantenimiento de auth/seguridad/hosting).
- **Usuarios:** registro abierto público. Cada usuario ve solo sus datos.
- **Verificación de email:** **no** en v1. Se deja el hueco (`email_verified`) para activarla más tarde.
- **Hosting:** desarrollo con **docker-compose local** en el Mac del usuario; producción en su servidor
  con **Dokploy** (Docker + Traefik). Todo dockerizado y compatible con ambos.
- **Importación:** reconstrucción de **trades round-trip** a partir de los fills, con deduplicación.
- **(v2) Multi-cuenta con selector:** una tabla `accounts` por usuario; trades, diario e importaciones
  cuelgan de la **cuenta activa**. Presets editables por tamaño/tipo. Tres **modos de drawdown**
  (Intraday / EOD / Static) que cambian la **lógica del suelo**.

## 1bis. Modos de drawdown y presets (reglas de negocio v2)

Los números de Apex **varían por versión (legacy vs 4.0) y por tipo**, por eso los presets son solo
un punto de partida **editable**; el usuario puede sobrescribir cualquier valor y pulsar
"restaurar preset". La app no impone los números: los propone.

### Modos de drawdown (`drawdown_mode`)

| Modo | Cómo se calcula el suelo | Notas |
|---|---|---|
| `intraday` | `suelo = min(peak − maxDrawdown, initialBalance + 100)` donde **peak incluye el flotante** (sube en tiempo real, nunca baja) | Es el comportamiento actual de la app. El tope `initialBalance + 100` es el "safety net": el trailing deja de subir ahí. |
| `eod` | Igual fórmula, pero **peak se calcula solo con los cierres diarios** (`daily_records.close`) + balance inicial; el flotante intradía **no** mueve el suelo | Además tiene un **límite de pérdida diario blando** (avisa/pausa, no tumba). |
| `static` | `suelo = initialBalance − maxDrawdown`, **constante**; no traila nunca | El desbloqueo de contratos completos ocurre al superar el safety net del tipo. |

Regla común: el suelo **nunca baja**. En `intraday`/`eod` deja de subir al llegar a `initialBalance + 100`.

### Tabla de presets (valores por defecto EDITABLES — verificar contra la oferta)

`size_label` → `{ initialBalance, maxDrawdown, profitTarget, maxContracts }`. El `drawdown_mode` se
elige aparte; el mismo tamaño sirve para intraday/eod (mismos dólares) y `static` trae su propio preset.

| size_label | initialBalance | maxDrawdown | profitTarget | maxContracts |
|---|---|---|---|---|
| `25K` | 25000 | 1500 | 1500 | 4 |
| `50K` | 50000 | 2000 | 3000 | 6 |
| `50K-legacy` | 50000 | 2500 | 3000 | 10 |
| `75K` | 75000 | 2750 | 4500 | 12 |
| `100K` | 100000 | 3000 | 6000 | 8 |
| `150K` | 150000 | 4000 | 9000 | 12 |
| `250K` | 250000 | 6500 | 15000 | 17 |
| `300K` | 300000 | 7500 | 20000 | 20 |
| `100K-static` | 100000 | 625 | 2000 | 2 |

> Los presets viven en `web/src/data/apexPresets.js` (frontend) y se replican en
> `server/src/accounts/presets.js` para validación. Cambiar un preset es editar ese fichero; cambiar
> los valores de **una cuenta concreta** es editable en la UI sin tocar el preset.

## 2. Arquitectura

Monorepo con dos aplicaciones e infraestructura Docker:

```
apex-dashboard/
├── web/                    # Frontend React + Vite (la app actual, movida aquí)
├── server/                 # Backend Node + Fastify + Postgres
│   ├── src/
│   │   ├── index.js        # arranque Fastify, plugins, CORS, rate-limit
│   │   ├── db.js           # pool de pg + helper de queries
│   │   ├── auth/           # register, login, refresh, logout, middleware
│   │   ├── routes/         # state, settings, account, trades, daily-records, import
│   │   ├── import/         # parser CSV + reconstrucción de trades
│   │   └── migrations/     # SQL numerado (0001_init.sql, ...)
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml      # dev: postgres + server + web (+ mailpit cuando haya email)
├── docker-compose.prod.yml # overrides de producción / referencia para Dokploy
├── .env.example
└── docs/superpowers/specs/ # este documento
```

- **Frontend:** sin cambios visuales. Se sustituye la capa de persistencia: el store Zustand deja de
  usar el middleware `persist(localStorage)` y pasa a hidratarse desde la API y a escribir vía API.
  Zustand queda como caché en memoria de la sesión; la **fuente de verdad es Postgres**.
- **Backend:** API REST con Fastify. Fastify sobre Express por validación de esquemas integrada
  (JSON Schema por ruta) y mejor rendimiento; mismo modelo mental que Express.
- **Postgres:** contenedor en dev; contenedor gestionado por Dokploy en prod.
- **Migraciones:** ficheros SQL numerados aplicados al arrancar el server (runner propio mínimo, sin ORM).

### Flujo de datos

```
React (Zustand en memoria)
   │  fetch con access token (Authorization: Bearer)
   ▼
Fastify  ──requireAuth──▶  user_id del JWT
   │  queries parametrizadas SIEMPRE filtradas por user_id
   ▼
Postgres (una fila por usuario en cada tabla)
```

## 3. Modelo de datos (v2 — multi-cuenta)

Dos niveles de aislamiento: por `user_id` (multi-tenant) y por `account_id` (multi-cuenta dentro del
usuario). `users` → `accounts` → (`trades`, `daily_records`, `import_batches`). Todo con
`ON DELETE CASCADE`. Los datos operativos cuelgan de la **cuenta**, no directamente del usuario.

### users
| columna | tipo | notas |
|---|---|---|
| id | uuid PK (`gen_random_uuid()`) | |
| email | citext único, not null | case-insensitive |
| password_hash | text not null | argon2id |
| email_verified | boolean not null default false | hueco para verificación futura |
| active_account_id | uuid null FK→accounts | cuenta seleccionada (selector); se pone al crear la 1.ª |
| created_at | timestamptz not null default now() | |

### accounts (N por user) — fusiona los antiguos `settings` + `account_state`
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| name | text not null | etiqueta libre ("Mi 50K EOD") |
| drawdown_mode | text not null | `intraday` \| `eod` \| `static` |
| size_label | text | clave del preset usado ("50K", "100K-static"…); informativo |
| initial_balance | numeric not null | editable (preset como default) |
| max_drawdown | numeric not null | editable |
| profit_target | numeric not null | editable |
| max_contracts | int not null | editable |
| eval_days | int not null default 30 | |
| start_date | date not null default CURRENT_DATE | |
| current_balance | numeric not null | estado vivo |
| peak_balance | numeric not null | pico histórico (para intraday/eod) |
| risk_per_trade | numeric not null default 200 | plan de riesgo, por cuenta |
| daily_stop_limit | numeric not null default 600 | |
| min_rr | numeric not null default 2 | |
| max_trades_per_day | int not null default 6 | |
| default_contracts | int not null default 1 | |
| default_instrument | text not null default 'MNQ' | |
| account_kind | text not null default 'Evaluación' | Evaluación \| PA |
| created_at | timestamptz not null default now() | |

Índice `(user_id)`. Al registrarse un usuario se crea automáticamente **una cuenta por defecto**
(preset `50K`, modo `intraday`) y se marca como activa, para que la app tenga siempre una cuenta.

### trades (N por account)
`id uuid PK`, `account_id uuid FK→accounts`, `user_id uuid FK→users` (redundante para queries y
defensa en profundidad), `date date`, `time text`, `instrument text`, `direction text` (LONG|SHORT),
`contracts int`, `result text` (WIN|LOSS|BE), `pnl numeric`, `points numeric null`,
`strategy text`, `notes text`, `source text` (manual|import) default 'manual',
`external_id text null`, `import_batch_id uuid null FK`, `created_at`.
Índice único parcial `(account_id, external_id) where external_id is not null` → dedupe **por cuenta**.
Índice `(account_id, date)`.

### daily_records (N por account)
`id uuid PK`, `account_id FK`, `user_id FK`, `date date`, `open numeric`, `close numeric`,
`note text`, `created_at`. Único `(account_id, date)` → upsert por fecha.

### import_batches (N por account)
`id uuid PK`, `account_id FK`, `user_id FK`, `filename text`, `created_at`, `row_count int`,
`trade_count int`, `inserted_count int`, `duplicate_count int`, `net_pnl numeric`,
`date_from date`, `date_to date`. Historial y **deshacer** un lote (borra sus trades por `import_batch_id`).

> **Nota de aislamiento:** aunque los datos cuelgan de `account_id`, cada query valida además que la
> cuenta pertenece al `user_id` del JWT (join o `WHERE account_id IN (SELECT id FROM accounts WHERE
> user_id=$user)`), para que nadie opere sobre una cuenta ajena pasando un `account_id` arbitrario.

## 4. Autenticación

- **Registro** `POST /auth/register` `{ email, password }`: valida, hashea con **argon2id**, crea
  `users` + **una `accounts` por defecto** (preset `50K`, modo `intraday`, marcada como activa) en una
  transacción, y devuelve tokens (entra directo; sin verificación en v1).
- **Login** `POST /auth/login`: verifica hash; devuelve **access token** (JWT, 15 min, en el cuerpo)
  y **refresh token** (JWT, 30 días, en **cookie httpOnly, Secure, SameSite=Lax**).
- **Refresh** `POST /auth/refresh`: lee la cookie, valida, rota el refresh token, emite nuevo access.
- **Logout** `POST /auth/logout`: revoca el refresh (tabla `refresh_tokens` con jti, o lista de
  revocación); borra la cookie.
- **`GET /auth/me`**: datos del usuario autenticado.
- **Middleware `requireAuth`**: valida el access token del header `Authorization: Bearer`, inyecta
  `req.user_id`. Todas las rutas `/api/*` lo usan.

### Seguridad
- Contraseñas: mínimo 8 caracteres (política simple, ampliable).
- **Rate-limiting** en `/auth/*` (p. ej. `@fastify/rate-limit`) contra fuerza bruta.
- **CORS** restringido al origen del frontend (env `WEB_ORIGIN`).
- Secretos JWT en variables de entorno (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).
- Cabeceras de seguridad con `@fastify/helmet`.
- Queries **siempre parametrizadas** y **siempre filtradas por `user_id`** del JWT, nunca del cliente.

## 5. API REST

Prefijo `/api`. Todas protegidas por `requireAuth` salvo `/auth/*`. Respuesta de error uniforme
`{ error: <code>, message: <texto> }`. Validación de entrada con JSON Schema por ruta.

**Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`GET /auth/me`.

**Multi-cuenta (v2):**
- `GET /api/accounts` — lista las cuentas del usuario + cuál es la activa.
- `POST /api/accounts` — crea una cuenta. Body `{ name, drawdownMode, sizeLabel }`; el servidor
  resuelve el preset (`presets.js`) y precarga los campos, que el cliente puede sobrescribir en el
  mismo body (cualquier campo de `accounts` es aceptado y validado). Si es la 1.ª, se marca activa.
- `PATCH /api/accounts/:id` — edita cualquier campo (incluye balance/peak/plan de riesgo/números del
  preset). Es el endpoint que usa la pantalla de Configuración.
- `POST /api/accounts/:id/activate` — marca la cuenta como activa (`users.active_account_id`).
- `DELETE /api/accounts/:id` — borra la cuenta y sus datos (con confirmación en UI). Si era la activa,
  se activa otra automáticamente.
- `GET /api/accounts/:id/reset-preset` — devuelve los valores de preset del `size_label` para que la
  UI ofrezca "restaurar preset" (no escribe; el guardado va por PATCH).

**Estado de la cuenta activa:**
- `GET /api/state` — datos de la **cuenta activa** en una sola llamada (carga inicial): la cuenta
  completa (settings + estado) para no hacer varias llamadas.

> **Scoping por cuenta:** las rutas de trades, daily-records e import operan sobre una cuenta concreta
> vía `?accountId=<id>` (query) — el cliente envía siempre la cuenta activa. El servidor valida que esa
> cuenta pertenece al `user_id` del JWT antes de tocar nada; si no, 404.

**Trades** (todas con `?accountId=`):
- `GET /api/trades?accountId=&from=&to=` — lista (rango opcional).
- `POST /api/trades?accountId=` — crea (manual).
- `PATCH /api/trades/:id` — edita (valida cuenta→usuario por join).
- `DELETE /api/trades/:id` — borra.
- `GET /api/trades/export.csv?accountId=` — export CSV desde servidor.

**Seguimiento del suelo** (todas con `?accountId=`):
- `GET /api/daily-records?accountId=`.
- `POST /api/daily-records?accountId=` — upsert por fecha.
- `DELETE /api/daily-records/:id`.

**Importación** (a la cuenta indicada):
- `POST /api/import/preview?accountId=` — sube el CSV (multipart), lo parsea y devuelve el análisis
  **sin guardar**: nº fills, nº trades reconstruidos, nuevos vs duplicados (dedupe **por cuenta**),
  P&L neto, rango de fechas, y la lista de trades propuestos.
- `POST /api/import/commit?accountId=` — inserta los trades nuevos y crea el `import_batch`.
  Parámetros: `{ rebuildDailyRecords: bool, newBalance: number|null }`.
- `GET /api/import/batches?accountId=` — historial de importaciones de esa cuenta.
- `DELETE /api/import/batches/:id` — deshace un lote (borra sus trades).

## 6. Sistema de importación de CSV

### Formato de entrada (verificado con `orders.csv` real)
Cabecera: `name,order_id,symbol,mov_time,mov_type,exec_qty,price_done,points,profit,created_on`.

- `symbol` `CM.MNQU6` → instrumento base **MNQ** (mapa de prefijos: `CM.` continuo/mes → clave de
  `INSTRUMENTS`). Símbolos desconocidos se marcan y se avisan en el preview.
- `exec_qty` con signo: `>0` compra, `<0` venta; su magnitud es el nº de contratos del fill.
- `profit`/`points` solo vienen rellenos en los fills de **cierre** (P&L realizado).
- `mov_time` incluye zona horaria (`GMT+0200 ...`) → se usa para la fecha/hora local del trade.

### Reconstrucción de fills → trades round-trip
Por símbolo, ordenando por tiempo, se lleva la **posición neta** con el signo de `exec_qty`. Cuando la
posición vuelve a **0**, se cierra un trade:
- `direction` = LONG si el primer fill del ciclo fue compra; SHORT si fue venta.
- `contracts` = tamaño máximo alcanzado por la posición en el ciclo.
- `entry` = precio medio ponderado de los fills de apertura; `exit` = medio de los de cierre.
- `pnl` = suma de `profit` de los fills de cierre del ciclo; `points` = suma de `points`.
- `result` = WIN si `pnl>0`, LOSS si `pnl<0`, BE si `pnl==0`.
- `date`/`time` = del último fill de cierre.

Validación esperada con el fichero de referencia: **114 fills → 57 trades**, **P&L neto −112 $**.
Estas cifras se muestran en el preview para cuadrar antes de confirmar.

### Deduplicación
Cada trade genera un `external_id` determinista = hash de los `order_id` que lo componen (ordenados).
El índice único `(account_id, external_id)` impide duplicar **dentro de la misma cuenta**. Reimportar
el mismo fichero en la misma cuenta → 0 nuevos. (El mismo CSV se puede importar en cuentas distintas.)

### Qué rellena la importación
- Crea los **trades** en el diario con `source='import'` y `import_batch_id`.
- Casilla opcional **"reconstruir también el seguimiento del suelo"**: genera/actualiza `daily_records`
  (apertura/cierre por día) a partir de los trades importados.
- **Balance:** no se toca automáticamente. El preview **propone** el balance resultante y el usuario
  confirma si quiere aplicarlo (`newBalance`).

### Flujo de UI (nueva pantalla "Importar")
Arrastrar/seleccionar CSV → `preview` → tabla de trades propuestos + totales (fills, trades, nuevos,
duplicados, P&L, rango) → opciones (reconstruir suelo, aplicar balance) → **Confirmar** (`commit`).
Sección de **historial** de importaciones con opción de **deshacer** un lote.

## 7. Cambios en el frontend

- Nuevo módulo `web/src/api/` (cliente fetch con manejo de access token + refresh automático al 401).
- `useStore`: se elimina el middleware `persist(localStorage)`. La hidratación inicial llama a
  `GET /api/state` + `GET /api/trades?accountId` + `GET /api/daily-records?accountId` de la **cuenta
  activa**. Cada mutación dispara la llamada API correspondiente e incluye el `accountId` activo.
- **Lógica del suelo por modo (v2):** `web/src/utils/calculations.js` gana `calcFloor(mode, {peak,
  initialBalance, maxDrawdown, dailyCloses})`. `intraday` usa el peak vivo; `eod` usa el peak de
  cierres diarios; `static` devuelve `initialBalance − maxDrawdown`. El Dashboard, el FloorTracker y
  las alertas usan este cálculo según `account.drawdownMode`. El aviso "el suelo sube con el flotante"
  solo se muestra en modo `intraday`; en `eod` se muestra el límite diario blando.
- **Selector de cuenta:** en la Navbar, un desplegable con las cuentas del usuario + "➕ Nueva cuenta".
  Cambiar de cuenta hace `activate` + re-`hydrate`.
- **Alta de cuenta:** modal/pantalla con `name`, selector de **modo** (Intraday/EOD/Static) y de
  **tamaño** (presets de `apexPresets.js`); al elegir tamaño se precargan balance/drawdown/objetivo/
  contratos, **todos editables** antes de crear.
- **Configuración por cuenta:** la pantalla Settings edita la cuenta activa vía `PATCH /accounts/:id`,
  con botón **"restaurar preset"** que repone los valores del `size_label` (sin borrar trades).
- Nuevas pantallas: **Login**, **Registro**, **Importar**. Guard de rutas: sin sesión → Login.
- Migración de datos locales: en el primer login, si hay datos en `localStorage`, se ofrece subirlos a
  la **cuenta por defecto** (una vez) para no perder el histórico previo.
- La navegación añade "Importar", el selector de cuenta y un menú de usuario (email + logout).

## 8. Plan por fases

Cada fase queda funcionando y probada antes de la siguiente.

- **Fase 0 — Monorepo + Docker.** Mover el front a `web/`; crear `server/` (Fastify base); `db.js`,
  runner de migraciones, `0001_init.sql`; `docker-compose.yml` (postgres + server + web);
  `.env.example`. `docker compose up` levanta todo en local.
- **Fase 1 — Auth + cuenta por defecto.** Tablas `users`/`refresh_tokens`/`accounts`;
  register (crea cuenta `50K` activa)/login/refresh/logout/me; `requireAuth`; rate-limit + CORS +
  helmet; pantallas Login/Registro; guard en el front.
- **Fase 2 — Persistencia en API (cuenta activa).** `presets.js`; rutas `/api/state` + `/api/trades`
  + `/api/daily-records` con `?accountId`; sustituir `localStorage` por el cliente API en el store;
  lógica de suelo por modo en el front; export CSV desde servidor; migración de datos locales.
- **Fase 3 — Multi-cuenta (selector + presets + modos).** Rutas `/api/accounts` (CRUD + activate +
  reset-preset); selector de cuenta en la Navbar; alta de cuenta con presets editables; Settings por
  cuenta; el Dashboard/FloorTracker/alertas ya consumen `drawdownMode`.
- **Fase 4 — Importación CSV.** Parser + reconstrucción round-trip + dedupe **por cuenta**;
  `preview`/`commit` con `?accountId`; historial y deshacer; pantalla Importar.
- **Fase 5 — Producción en Dokploy.** Dockerfiles de producción; `docker-compose.prod.yml` de
  referencia; variables de entorno; guía de despliegue (TLS/Traefik los pone Dokploy). Hueco de
  verificación de email listo para activar.

## 9. Testing

- **Backend:** tests de unidad del parser de importación (fills→trades, dedupe, cálculo de P&L con el
  `orders.csv` real como fixture); tests de integración de auth (register/login/refresh, aislamiento
  por `user_id`) y de las rutas CRUD contra una Postgres de test (contenedor).
- **Frontend:** prueba de humo con Playwright de los flujos clave (login, ver dashboard, importar CSV)
  como se hizo con la app actual.
- **Aislamiento multi-tenant:** test explícito de que un usuario no puede leer/escribir filas de otro.
- **Aislamiento multi-cuenta (v2):** test de que un `accountId` de otra cuenta (propia o ajena) no
  expone ni modifica datos; y test unitario de `calcFloor` para los tres modos (intraday/eod/static),
  incluido el tope `initialBalance + 100`.

## 10. Fuera de alcance (v1/v2)

- Verificación de email y recuperación de contraseña (hueco preparado; se activan después).
- Roles/admin, planes de pago, panel de administración.
- Sincronización en tiempo real entre pestañas/dispositivos (la recarga trae el estado actual).
- Agrupaciones de importación más allá del round-trip por símbolo (p. ej. scaling parcial complejo).
- Copy-trading real entre cuentas o detección de hedging entre cuentas (Apex lo controla; la app no).
- Vistas agregadas entre cuentas (P&L combinado de todas): posible fase futura; v2 opera por cuenta.

## 11. Riesgos y notas

- **Seguridad es responsabilidad propia** (backend a medida): hay que mantener dependencias, secretos,
  rate-limiting y backups de Postgres. Documentado en la guía de despliegue.
- **Zona horaria** del `mov_time`: se respeta el offset del propio CSV para fechar los trades.
- **Datos de instrumentos de divisas** (`M6E`/`M6B`) siguen con `ticksPerPt` según el documento
  original; si la plataforma difiere, se ajusta el mapa de símbolos.
- **Backup:** el export/import JSON del cliente se conserva como salida de emergencia; además se
  recomienda backup de Postgres en prod.
- **(v2) Precisión de los presets:** los números de Apex cambian por versión (legacy vs 4.0) y por
  tipo (intraday/eod/static); la web oficial bloquea el acceso automático (403), así que la tabla de
  presets es **best-effort y editable**. La app no es una fuente de verdad regulatoria: el usuario
  ajusta cualquier valor por cuenta y hay "restaurar preset". Verificar los números contra la oferta
  concreta antes de fiarse de un default.
