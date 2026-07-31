# Backend multiusuario, login, importación CSV y multi-cuenta — Plan de implementación (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la app cliente (localStorage) en full-stack multiusuario y **multi-cuenta**, con backend Node+Fastify+Postgres, login JWT (registro público), presets editables por tipo/tamaño de cuenta con tres modos de drawdown (Intraday/EOD/Static), e importación de CSV de fills que reconstruye trades round-trip por cuenta.

**Architecture:** Monorepo `web/` (React+Vite) + `server/` (Fastify + Postgres vía `pg`, migraciones SQL numeradas, sin ORM). Dos niveles de aislamiento: `user_id` (JWT) y `account_id` (cuenta activa). Los datos operativos cuelgan de `accounts`. La lógica del suelo se ramifica por `drawdown_mode`. Todo dockerizado: dev con `docker compose`, prod con Dokploy.

**Tech Stack:** Node 20+, Fastify 4, `pg`, `argon2`, `@fastify/jwt`, `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/multipart`, `csv-parse`. Tests con `node:test` + Fastify `.inject()`. Postgres 16. Frontend React 19 + Vite + Zustand + Recharts.

## Global Constraints

- **Node** ≥ 20. **Postgres** 16. IDs `uuid` (`gen_random_uuid()`, extensión `pgcrypto`). Email `citext`.
- **Sin ORM.** SQL parametrizado siempre. **Doble aislamiento:** cada query filtra por `user_id` del JWT y, para datos operativos, valida que el `account_id` pertenece a ese usuario (nunca se confía en el `accountId` del cliente sin validar).
- **Hashing** argon2id. Contraseña mínima 8 caracteres.
- **Access token** JWT 15 min (cuerpo). **Refresh** JWT 30 días en cookie `httpOnly, Secure, SameSite=Lax`.
- **CORS** restringido a `WEB_ORIGIN`. Rate-limit en `/auth/*`. Secretos por env; `.env` en `.gitignore`.
- **Modos de drawdown** (fórmula del suelo, en `web/src/utils/calculations.js` y espejo en tests):
  - `intraday`: `min(peak − maxDrawdown, initialBalance + 100)`, peak incluye flotante.
  - `eod`: igual, pero peak = `max(initialBalance, ...cierres diarios)`.
  - `static`: `initialBalance − maxDrawdown` (constante).
  - Regla común: el suelo nunca baja; en intraday/eod deja de subir en `initialBalance + 100`.
- **Presets** (valores por defecto EDITABLES; verificar contra la oferta) en `server/src/accounts/presets.js` y `web/src/data/apexPresets.js` (mismo contenido):
  `25K {25000,1500,1500,4}`, `50K {50000,2000,3000,6}`, `50K-legacy {50000,2500,3000,10}`,
  `75K {75000,2750,4500,12}`, `100K {100000,3000,6000,8}`, `150K {150000,4000,9000,12}`,
  `250K {250000,6500,15000,17}`, `300K {300000,7500,20000,20}`, `100K-static {100000,625,2000,2}`
  (orden: `initialBalance, maxDrawdown, profitTarget, maxContracts`).
- **Fixture de importación**: `server/test/fixtures/orders.csv`. Debe dar **114 fills → 57 trades, P&L −112.00**.
- **Al registrarse** se crea automáticamente una cuenta por defecto (`50K`, `intraday`) marcada activa.

---

## Estructura de ficheros

```
apex-dashboard/
├── web/
│   ├── src/
│   │   ├── api/{client,endpoints,importApi,migrateLocal}.js
│   │   ├── data/apexPresets.js            # (F3) presets editables
│   │   ├── store/{useStore,useAuth,useAccounts}.js
│   │   ├── utils/calculations.js          # (F2) calcFloor(mode, ...)
│   │   ├── components/{AuthScreen,AccountSwitcher,NewAccountModal,ImportTrades}.jsx
│   │   └── ...                            # resto existente
│   └── ...
├── server/
│   ├── src/
│   │   ├── index.js, app.js, config.js, db.js, migrate.js
│   │   ├── auth/{routes,tokens,requireAuth}.js
│   │   ├── accounts/{presets.js, guard.js}   # guard = valida account→user
│   │   ├── routes/{state,accounts,trades,dailyRecords,import}.js
│   │   ├── import/{parseOrders,buildTrades,instruments}.js
│   │   └── migrations/0001_init.sql … 0005_import_staging.sql
│   ├── test/{helpers.js, fixtures/orders.csv, *.test.js}
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml / docker-compose.prod.yml / .env.example / .gitignore
```

---

# FASE 0 — Monorepo + Docker

**Entregable:** `docker compose up` levanta Postgres + server (`/health`) + web, con migraciones aplicadas.

### Task 0.1: Inicializar git y mover el frontend a `web/`

**Files:** Create `.gitignore`; Move todo el proyecto → `web/`.

- [ ] **Step 1: git init**

Run: `cd /Users/pomo/Documents/App/trade/apex-dashboard && git init`
Expected: "Initialized empty Git repository".

- [ ] **Step 2: `.gitignore`**

```
node_modules/
dist/
.env
.env.*
!.env.example
*.log
.DS_Store
```

- [ ] **Step 3: Mover el frontend a `web/`**

```bash
mkdir web
for f in dist index.html netlify.toml package.json package-lock.json postcss.config.js public src tailwind.config.js vercel.json vite.config.js README.md; do
  [ -e "$f" ] && mv "$f" web/ 2>/dev/null
done
rm -rf web/dist node_modules web/node_modules
```
Expected: `web/` con `src/`, `index.html`, `package.json`; raíz con `web/`, `docs/`, `.gitignore`.

- [ ] **Step 4: Verificar build**

Run: `cd web && npm install && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/trade/apex-dashboard && git add -A
git commit -m "chore: monorepo — mover frontend a web/ e iniciar git"
```

### Task 0.2: Scaffold Fastify con `/health`

**Files:** Create `server/package.json`, `server/src/{config,app,index}.js`; Test `server/test/health.test.js`.
**Interfaces:** Produces `buildApp() -> Fastify`; `GET /health -> { status:'ok' }`.

- [ ] **Step 1: `server/package.json`**

```json
{
  "name": "apex-server",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "migrate": "node src/migrate.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/multipart": "^8.3.0",
    "@fastify/rate-limit": "^9.1.0",
    "argon2": "^0.41.1",
    "csv-parse": "^5.5.6",
    "fastify": "^4.28.1",
    "pg": "^8.13.1"
  }
}
```

- [ ] **Step 2: Instalar** — Run: `cd server && npm install`. Expected: sin errores.

- [ ] **Step 3: `server/src/config.js`**

```js
export const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'postgres://apex:apex@localhost:5432/apex',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  isProd: process.env.NODE_ENV === 'production',
}
```

- [ ] **Step 4: Test `server/test/health.test.js`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'

test('GET /health responde ok', async () => {
  const app = buildApp()
  const res = await app.inject({ method: 'GET', url: '/health' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { status: 'ok' })
  await app.close()
})
```

- [ ] **Step 5: Ejecutar y ver fallo** — Run: `cd server && node --test test/health.test.js`. Expected: FAIL (no existe app.js).

- [ ] **Step 6: `server/src/app.js`**

```js
import Fastify from 'fastify'
export function buildApp() {
  const app = Fastify({ logger: false })
  app.get('/health', async () => ({ status: 'ok' }))
  return app
}
```

- [ ] **Step 7: Ejecutar y ver pasar** — Run: `cd server && node --test test/health.test.js`. Expected: PASS.

- [ ] **Step 8: `server/src/index.js`**

```js
import { buildApp } from './app.js'
import { config } from './config.js'
const app = buildApp()
app.listen({ port: config.port, host: config.host })
  .then(() => console.log(`server on :${config.port}`))
  .catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 9: Commit**

```bash
git add server/
git commit -m "feat(server): scaffold Fastify con /health y test"
```

### Task 0.3: Capa DB + runner de migraciones

**Files:** Create `server/src/{db,migrate}.js`, `server/src/migrations/0001_init.sql`; Test `server/test/migrate.test.js`.
**Interfaces:** Produces `query(text,params)`, `getPool()`, `closePool()` (db.js); `runMigrations(pool) -> string[]` (migrate.js).

- [ ] **Step 1: `server/src/db.js`**

```js
import pg from 'pg'
import { config } from './config.js'
let pool
export function getPool() {
  if (!pool) pool = new pg.Pool({ connectionString: config.databaseUrl })
  return pool
}
export function query(text, params) { return getPool().query(text, params) }
export async function closePool() { if (pool) { await pool.end(); pool = undefined } }
```

- [ ] **Step 2: `server/src/migrations/0001_init.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE IF NOT EXISTS _migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: `server/src/migrate.js`**

```js
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from './db.js'

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function runMigrations(pool = getPool()) {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const files = (await readdir(MIG_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const done = (await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name)
  const applied = []
  for (const file of files) {
    if (done.includes(file)) continue
    const sql = await readFile(join(MIG_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file])
      await client.query('COMMIT')
      applied.push(file)
    } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
  }
  return applied
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then((a) => { console.log('migraciones:', a.length ? a.join(', ') : '(ninguna)'); return closePool() })
    .catch((e) => { console.error(e); process.exit(1) })
}
```

- [ ] **Step 4: Test `server/test/migrate.test.js`**

```js
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { runMigrations } from '../src/migrate.js'
import { query, closePool } from '../src/db.js'

after(() => closePool())

test('runMigrations aplica 0001 y es idempotente', async () => {
  const first = await runMigrations()
  assert.ok(first.includes('0001_init.sql'))
  const second = await runMigrations()
  assert.equal(second.length, 0)
  const ext = await query("SELECT 1 FROM pg_extension WHERE extname='pgcrypto'")
  assert.equal(ext.rowCount, 1)
})
```

- [ ] **Step 5: Postgres de prueba**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16
sleep 3
```

- [ ] **Step 6: Ejecutar** — Run: `cd server && node --test test/migrate.test.js`. Expected: PASS.

- [ ] **Step 7: Parar** — Run: `docker stop apex-pg-test`.

- [ ] **Step 8: Commit**

```bash
git add server/src/db.js server/src/migrate.js server/src/migrations/ server/test/migrate.test.js
git commit -m "feat(server): pool pg + runner de migraciones idempotente"
```

### Task 0.4: docker-compose dev + migraciones al arrancar

**Files:** Create `docker-compose.yml`, `server/Dockerfile`, `web/Dockerfile.dev`, `.env.example`; Modify `server/src/index.js`.

- [ ] **Step 1: `.env.example`**

```
POSTGRES_USER=apex
POSTGRES_PASSWORD=apex
POSTGRES_DB=apex
DATABASE_URL=postgres://apex:apex@db:5432/apex
PORT=3001
WEB_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
NODE_ENV=development
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 2: `server/Dockerfile`**

```dockerfile
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 3001
CMD ["node", "src/index.js"]
```

- [ ] **Step 3: `web/Dockerfile.dev`**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

- [ ] **Step 4: `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-apex}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-apex}
      POSTGRES_DB: ${POSTGRES_DB:-apex}
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-apex}']
      interval: 3s
      timeout: 3s
      retries: 10
  server:
    build: ./server
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-apex}:${POSTGRES_PASSWORD:-apex}@db:5432/${POSTGRES_DB:-apex}
      PORT: 3001
      WEB_ORIGIN: http://localhost:5173
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:-dev-access-secret-change-me}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-dev-refresh-secret-change-me}
      NODE_ENV: development
    ports: ['3001:3001']
    depends_on:
      db: { condition: service_healthy }
    volumes: ['./server/src:/app/src']
  web:
    build: { context: ./web, dockerfile: Dockerfile.dev }
    environment:
      VITE_API_URL: http://localhost:3001
    ports: ['5173:5173']
    volumes: ['./web:/app', '/app/node_modules']
    depends_on: ['server']
volumes:
  pgdata:
```

- [ ] **Step 5: `server/src/index.js` (migra al arrancar)**

```js
import { buildApp } from './app.js'
import { config } from './config.js'
import { runMigrations } from './migrate.js'
const start = async () => {
  const applied = await runMigrations()
  console.log('migraciones:', applied.length ? applied.join(', ') : 'al día')
  const app = buildApp()
  await app.listen({ port: config.port, host: config.host })
  console.log(`server on :${config.port}`)
}
start().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 6: Levantar y verificar**

```bash
cp .env.example .env
docker compose up -d --build
sleep 8
curl -s http://localhost:3001/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: `{"status":"ok"}` y `200`.

- [ ] **Step 7: Parar** — Run: `docker compose down`.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml server/Dockerfile web/Dockerfile.dev .env.example server/src/index.js
git commit -m "feat: docker-compose dev con migraciones al arrancar"
```

---

# FASE 1 — Auth + cuenta por defecto

**Entregable:** register (crea cuenta `50K` activa)/login/refresh/logout/me; tablas `users`/`refresh_tokens`/`accounts`; rate-limit/CORS/helmet; Login/Registro y guard en el front.

### Task 1.1: Migraciones auth + accounts + datos

**Files:** Create `server/src/migrations/0002_auth.sql`, `0003_accounts.sql`, `0004_data.sql`; Modify `server/test/migrate.test.js`.
**Interfaces:** Produces tablas `users, refresh_tokens, accounts, trades, daily_records, import_batches`.

- [ ] **Step 1: `0002_auth.sql`**

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  active_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refresh_tokens (
  jti uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
```

- [ ] **Step 2: `0003_accounts.sql`**

```sql
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mi cuenta',
  drawdown_mode text NOT NULL DEFAULT 'intraday',
  size_label text,
  initial_balance numeric NOT NULL DEFAULT 50000,
  max_drawdown numeric NOT NULL DEFAULT 2000,
  profit_target numeric NOT NULL DEFAULT 3000,
  max_contracts int NOT NULL DEFAULT 6,
  eval_days int NOT NULL DEFAULT 30,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  current_balance numeric NOT NULL DEFAULT 50000,
  peak_balance numeric NOT NULL DEFAULT 50000,
  risk_per_trade numeric NOT NULL DEFAULT 200,
  daily_stop_limit numeric NOT NULL DEFAULT 600,
  min_rr numeric NOT NULL DEFAULT 2,
  max_trades_per_day int NOT NULL DEFAULT 6,
  default_contracts int NOT NULL DEFAULT 1,
  default_instrument text NOT NULL DEFAULT 'MNQ',
  account_kind text NOT NULL DEFAULT 'Evaluación',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_user ON accounts(user_id);
ALTER TABLE users ADD CONSTRAINT fk_active_account
  FOREIGN KEY (active_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
```

- [ ] **Step 3: `0004_data.sql`**

```sql
CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text,
  row_count int NOT NULL DEFAULT 0,
  trade_count int NOT NULL DEFAULT 0,
  inserted_count int NOT NULL DEFAULT 0,
  duplicate_count int NOT NULL DEFAULT 0,
  net_pnl numeric NOT NULL DEFAULT 0,
  date_from date, date_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  time text,
  instrument text NOT NULL,
  direction text NOT NULL,
  contracts int NOT NULL DEFAULT 1,
  result text NOT NULL,
  pnl numeric NOT NULL DEFAULT 0,
  points numeric,
  strategy text DEFAULT '',
  notes text DEFAULT '',
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_trade_external ON trades(account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_trades_account_date ON trades(account_id, date);
CREATE TABLE daily_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  open numeric, close numeric NOT NULL, note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, date)
);
```

- [ ] **Step 4: Test de tablas (añadir a `migrate.test.js`)**

```js
test('las tablas existen tras migrar', async () => {
  await runMigrations()
  const r = await query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)",
    [['users', 'accounts', 'trades', 'daily_records', 'import_batches', 'refresh_tokens']],
  )
  assert.equal(r.rowCount, 6)
})
```

- [ ] **Step 5: Ejecutar**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/migrate.test.js
docker stop apex-pg-test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/migrations/ server/test/migrate.test.js
git commit -m "feat(server): esquema auth + accounts + datos por cuenta"
```

### Task 1.2: Presets y helper de tests

**Files:** Create `server/src/accounts/presets.js`, `server/test/helpers.js`; Test `server/test/presets.test.js`.
**Interfaces:** Produces `PRESETS` (objeto), `presetFor(label) -> {initialBalance,maxDrawdown,profitTarget,maxContracts}|null`; `setupTestDb()`, `makeApp()`, `closeAll()`.

- [ ] **Step 1: `server/src/accounts/presets.js`**

```js
export const PRESETS = {
  '25K': { initialBalance: 25000, maxDrawdown: 1500, profitTarget: 1500, maxContracts: 4 },
  '50K': { initialBalance: 50000, maxDrawdown: 2000, profitTarget: 3000, maxContracts: 6 },
  '50K-legacy': { initialBalance: 50000, maxDrawdown: 2500, profitTarget: 3000, maxContracts: 10 },
  '75K': { initialBalance: 75000, maxDrawdown: 2750, profitTarget: 4500, maxContracts: 12 },
  '100K': { initialBalance: 100000, maxDrawdown: 3000, profitTarget: 6000, maxContracts: 8 },
  '150K': { initialBalance: 150000, maxDrawdown: 4000, profitTarget: 9000, maxContracts: 12 },
  '250K': { initialBalance: 250000, maxDrawdown: 6500, profitTarget: 15000, maxContracts: 17 },
  '300K': { initialBalance: 300000, maxDrawdown: 7500, profitTarget: 20000, maxContracts: 20 },
  '100K-static': { initialBalance: 100000, maxDrawdown: 625, profitTarget: 2000, maxContracts: 2 },
}
export const DRAWDOWN_MODES = ['intraday', 'eod', 'static']
export function presetFor(label) { return PRESETS[label] || null }
```

- [ ] **Step 2: Test `server/test/presets.test.js`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presetFor, PRESETS } from '../src/accounts/presets.js'

test('preset 50K trae los valores 4.0', () => {
  assert.deepEqual(presetFor('50K'), { initialBalance: 50000, maxDrawdown: 2000, profitTarget: 3000, maxContracts: 6 })
})
test('preset desconocido devuelve null', () => { assert.equal(presetFor('999K'), null) })
test('hay 9 presets', () => { assert.equal(Object.keys(PRESETS).length, 9) })
```

- [ ] **Step 3: Ejecutar** — Run: `cd server && node --test test/presets.test.js`. Expected: PASS (no requiere DB).

- [ ] **Step 4: `server/test/helpers.js`**

```js
import { runMigrations } from '../src/migrate.js'
import { query, closePool } from '../src/db.js'
import { buildApp } from '../src/app.js'
export async function setupTestDb() {
  await runMigrations()
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
}
export function makeApp() { return buildApp() }
export async function closeAll() { await closePool() }
```

- [ ] **Step 5: Commit**

```bash
git add server/src/accounts/presets.js server/test/presets.test.js server/test/helpers.js
git commit -m "feat(server): presets editables + helper de tests"
```

### Task 1.3: Registro (crea cuenta por defecto) y login

**Files:** Create `server/src/auth/{tokens,routes}.js`; Modify `server/src/app.js`; Test `server/test/auth.test.js`.
**Interfaces:** Produces `signAccess(app,sub)`, `signRefresh(app,sub)`, `refreshCookieOpts(isProd)`; rutas register/login que además crean/activan la cuenta por defecto.

- [ ] **Step 1: Test `server/test/auth.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'

let app
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(() => query('TRUNCATE users RESTART IDENTITY CASCADE'))

test('registro crea usuario, cuenta por defecto activa y accessToken', async () => {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })
  assert.equal(res.statusCode, 201)
  assert.ok(res.json().accessToken)
  const acc = await query('SELECT a.*, u.active_account_id FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.email=$1', ['a@b.com'])
  assert.equal(acc.rowCount, 1)
  assert.equal(acc.rows[0].size_label, '50K')
  assert.equal(acc.rows[0].active_account_id, acc.rows[0].id)
})

test('login correcto / incorrecto / duplicado', async () => {
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.com', password: 'password123' } })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.com', password: 'nope12345' } })).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'A@b.com', password: 'password123' } })).statusCode, 409)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/auth.test.js
```
Expected: FAIL (rutas 404).

- [ ] **Step 3: `server/src/auth/tokens.js`**

```js
import crypto from 'node:crypto'
export const ACCESS_TTL = '15m'
export const REFRESH_TTL_DAYS = 30
export function signAccess(app, sub) { return app.jwt.sign({ sub, typ: 'access' }, { expiresIn: ACCESS_TTL }) }
export function signRefresh(app, sub) {
  const jti = crypto.randomUUID()
  const token = app.jwtRefresh.sign({ sub, jti, typ: 'refresh' }, { expiresIn: `${REFRESH_TTL_DAYS}d` })
  return { token, jti, expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400000) }
}
export function refreshCookieOpts(isProd) {
  return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/auth', maxAge: REFRESH_TTL_DAYS * 86400 }
}
```

- [ ] **Step 4: `server/src/auth/routes.js`**

```js
import argon2 from 'argon2'
import { query, getPool } from '../db.js'
import { config } from '../config.js'
import { presetFor } from '../accounts/presets.js'
import { signAccess, signRefresh, refreshCookieOpts } from './tokens.js'
import { requireAuth } from './requireAuth.js'

const credsSchema = {
  body: {
    type: 'object', required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
}

async function issueSession(app, reply, user, statusCode) {
  const accessToken = signAccess(app, user.id)
  const { token, jti, expiresAt } = signRefresh(app, user.id)
  await query('INSERT INTO refresh_tokens(jti,user_id,expires_at) VALUES ($1,$2,$3)', [jti, user.id, expiresAt])
  reply.setCookie('refresh_token', token, refreshCookieOpts(config.isProd))
  reply.code(statusCode).send({ user: { id: user.id, email: user.email }, accessToken })
}

export async function authRoutes(app) {
  app.post('/auth/register', { schema: credsSchema }, async (req, reply) => {
    const { email, password } = req.body
    if ((await query('SELECT 1 FROM users WHERE email=$1', [email])).rowCount)
      return reply.code(409).send({ error: 'email_taken', message: 'Ese email ya está registrado' })
    const hash = await argon2.hash(password, { type: argon2.argon2id })
    const p = presetFor('50K')
    const client = await getPool().connect()
    let user
    try {
      await client.query('BEGIN')
      user = (await client.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id,email', [email, hash])).rows[0]
      const acc = (await client.query(
        `INSERT INTO accounts(user_id,name,drawdown_mode,size_label,initial_balance,max_drawdown,profit_target,max_contracts,current_balance,peak_balance,default_contracts)
         VALUES ($1,'Mi 50K','intraday','50K',$2,$3,$4,$5,$2,$2,1) RETURNING id`,
        [user.id, p.initialBalance, p.maxDrawdown, p.profitTarget, p.maxContracts],
      )).rows[0]
      await client.query('UPDATE users SET active_account_id=$2 WHERE id=$1', [user.id, acc.id])
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    await issueSession(app, reply, user, 201)
  })

  app.post('/auth/login', { schema: credsSchema }, async (req, reply) => {
    const u = (await query('SELECT id,email,password_hash FROM users WHERE email=$1', [req.body.email])).rows[0]
    if (!u || !(await argon2.verify(u.password_hash, req.body.password)))
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Email o contraseña incorrectos' })
    await issueSession(app, reply, u, 200)
  })
}
```

- [ ] **Step 5: `server/src/app.js` (plugins + auth)**

```js
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { authRoutes } from './auth/routes.js'

export function buildApp() {
  const app = Fastify({ logger: false })
  app.register(helmet)
  app.register(cors, { origin: config.webOrigin, credentials: true })
  app.register(cookie)
  app.register(jwt, { secret: config.jwtAccessSecret })
  app.register(jwt, { secret: config.jwtRefreshSecret, namespace: 'refresh', jwtVerify: 'jwtRefreshVerify', jwtSign: 'jwtRefreshSign' })
  app.decorate('jwtRefresh', {
    sign: (payload, opts) => app.jwtRefreshSign(payload, opts),
    verify: (token) => app.jwtRefreshVerify(token),
  })
  app.register(async (scope) => {
    await scope.register(rateLimit, { max: 20, timeWindow: '1 minute' })
    await authRoutes(scope)
  })
  app.get('/health', async () => ({ status: 'ok' }))
  return app
}
```

- [ ] **Step 6: Ejecutar y ver pasar** — Run: `cd server && node --test test/auth.test.js`. Expected: PASS.

- [ ] **Step 7: Parar y commit**

```bash
docker stop apex-pg-test
git add server/src/auth/ server/src/app.js server/test/auth.test.js
git commit -m "feat(server): registro con cuenta 50K por defecto + login"
```

### Task 1.4: Refresh, logout, me y requireAuth

**Files:** Create `server/src/auth/requireAuth.js`; Modify `server/src/auth/routes.js`; Test `server/test/auth.test.js`.
**Interfaces:** Produces `requireAuth(req,reply)` (deja `req.userId`); `POST /auth/refresh`, `/auth/logout`, `GET /auth/me`.

- [ ] **Step 1: Añadir tests a `auth.test.js`**

```js
test('refresh, me y logout', async () => {
  const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })
  const cookie = reg.headers['set-cookie']; const token = reg.json().accessToken
  assert.equal((await app.inject({ method: 'POST', url: '/auth/refresh', headers: { cookie } })).statusCode, 200)
  const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } })
  assert.equal(me.json().user.email, 'a@b.com')
  assert.ok(me.json().activeAccountId)
  assert.equal((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } })).statusCode, 204)
  assert.equal((await app.inject({ method: 'POST', url: '/auth/refresh', headers: { cookie } })).statusCode, 401)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/auth.test.js
```
Expected: FAIL (rutas nuevas 404).

- [ ] **Step 3: `server/src/auth/requireAuth.js`**

```js
export async function requireAuth(req, reply) {
  try {
    const payload = await req.jwtVerify()
    if (payload.typ !== 'access') throw new Error('wrong type')
    req.userId = payload.sub
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: 'Sesión no válida' })
  }
}
```

- [ ] **Step 4: Añadir rutas a `server/src/auth/routes.js`** (dentro de `authRoutes`)

```js
  app.post('/auth/refresh', async (req, reply) => {
    const token = req.cookies?.refresh_token
    if (!token) return reply.code(401).send({ error: 'no_refresh', message: 'Sin sesión' })
    let payload
    try { payload = await app.jwtRefresh.verify(token); if (payload.typ !== 'refresh') throw 0 }
    catch { return reply.code(401).send({ error: 'invalid_refresh', message: 'Sesión caducada' }) }
    const row = await query('SELECT revoked,expires_at FROM refresh_tokens WHERE jti=$1', [payload.jti])
    if (!row.rowCount || row.rows[0].revoked || new Date(row.rows[0].expires_at) < new Date())
      return reply.code(401).send({ error: 'invalid_refresh', message: 'Sesión caducada' })
    await query('UPDATE refresh_tokens SET revoked=true WHERE jti=$1', [payload.jti])
    const accessToken = signAccess(app, payload.sub)
    const { token: nr, jti, expiresAt } = signRefresh(app, payload.sub)
    await query('INSERT INTO refresh_tokens(jti,user_id,expires_at) VALUES ($1,$2,$3)', [jti, payload.sub, expiresAt])
    reply.setCookie('refresh_token', nr, refreshCookieOpts(config.isProd))
    reply.send({ accessToken })
  })

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies?.refresh_token
    if (token) { try { const p = await app.jwtRefresh.verify(token); await query('UPDATE refresh_tokens SET revoked=true WHERE jti=$1', [p.jti]) } catch { /* */ } }
    reply.clearCookie('refresh_token', { path: '/auth' })
    reply.code(204).send()
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const r = await query('SELECT id,email,active_account_id FROM users WHERE id=$1', [req.userId])
    return { user: { id: r.rows[0].id, email: r.rows[0].email }, activeAccountId: r.rows[0].active_account_id }
  })
```

- [ ] **Step 5: Ejecutar y ver pasar** — Run: `cd server && node --test test/auth.test.js`. Expected: PASS.

- [ ] **Step 6: Parar y commit**

```bash
docker stop apex-pg-test
git add server/src/auth/ server/test/auth.test.js
git commit -m "feat(server): refresh con rotación, logout, me + requireAuth"
```

### Task 1.5: Frontend — cliente API, sesión, pantallas y guard

**Files:** Create `web/src/api/client.js`, `web/src/store/useAuth.js`, `web/src/components/AuthScreen.jsx`; Modify `web/src/App.jsx`, `web/src/components/Navbar.jsx`.
**Interfaces:** Produces `apiFetch`, `setAccessToken`, `getAccessToken`, `API_BASE`; store `useAuth` con `{user,status,activeAccountId,login,register,logout,bootstrap}`.

- [ ] **Step 1: `web/src/api/client.js`**

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
let accessToken = null
export const setAccessToken = (t) => { accessToken = t }
export const getAccessToken = () => accessToken
export const API_BASE = API_URL

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  return fetch(`${API_URL}${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined })
}
async function tryRefresh() {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!res.ok) return false
  accessToken = (await res.json()).accessToken
  return true
}
export async function apiFetch(path, opts = {}) {
  let res = await raw(path, opts)
  if (res.status === 401 && opts.auth !== false && (await tryRefresh())) res = await raw(path, opts)
  if (!res.ok) {
    let p = {}; try { p = await res.json() } catch { /* */ }
    const err = new Error(p.message || `HTTP ${res.status}`); err.status = res.status; err.code = p.error
    throw err
  }
  return res.status === 204 ? null : res.json()
}
```

- [ ] **Step 2: `web/src/store/useAuth.js`**

```js
import { create } from 'zustand'
import { apiFetch, setAccessToken, API_BASE } from '../api/client'
export const useAuth = create((set) => ({
  user: null, status: 'loading', activeAccountId: null,
  async bootstrap() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('no session')
      setAccessToken((await res.json()).accessToken)
      const me = await apiFetch('/auth/me')
      set({ user: me.user, activeAccountId: me.activeAccountId, status: 'authenticated' })
    } catch { set({ user: null, status: 'anonymous' }) }
  },
  async login(email, password) {
    const d = await apiFetch('/auth/login', { method: 'POST', auth: false, body: { email, password } })
    setAccessToken(d.accessToken)
    const me = await apiFetch('/auth/me')
    set({ user: d.user, activeAccountId: me.activeAccountId, status: 'authenticated' })
  },
  async register(email, password) {
    const d = await apiFetch('/auth/register', { method: 'POST', auth: false, body: { email, password } })
    setAccessToken(d.accessToken)
    const me = await apiFetch('/auth/me')
    set({ user: d.user, activeAccountId: me.activeAccountId, status: 'authenticated' })
  },
  setActiveAccountId(id) { set({ activeAccountId: id }) },
  async logout() { try { await apiFetch('/auth/logout', { method: 'POST' }) } catch { /* */ } setAccessToken(null); set({ user: null, status: 'anonymous' }) },
}))
```

- [ ] **Step 3: `web/src/components/AuthScreen.jsx`**

```jsx
import { useState } from 'react'
import { useAuth } from '../store/useAuth'
import { Section, Field, NoteBox } from './ui'
export default function AuthScreen() {
  const login = useAuth((s) => s.login), register = useAuth((s) => s.register)
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [error, setError] = useState(null), [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setError(null); setBusy(true)
    try { mode === 'login' ? await login(email, password) : await register(email, password) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 border border-gold/40"><span className="text-gold font-black">A</span></div>
          <h1 className="text-lg font-bold text-slate-100">Apex Dashboard</h1>
        </div>
        <Section title={mode === 'login' ? 'Entrar' : 'Crear cuenta'}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres"><input type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {error && <NoteBox tone="red">{error}</NoteBox>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? '...' : mode === 'login' ? 'Entrar' : 'Registrarme'}</button>
          </form>
          <button className="mt-4 w-full text-xs text-muted hover:text-gold" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
          </button>
        </Section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Guard en `web/src/App.jsx`**

Añadir imports `import { useAuth } from './store/useAuth'` y `import AuthScreen from './components/AuthScreen'`. Dentro de `App()` antes del `return`:
```jsx
  const authStatus = useAuth((s) => s.status)
  const bootstrap = useAuth((s) => s.bootstrap)
  useEffect(() => { bootstrap() }, [bootstrap])
  if (authStatus === 'loading') return <div className="min-h-screen flex items-center justify-center text-muted">Cargando…</div>
  if (authStatus === 'anonymous') return <AuthScreen />
```

- [ ] **Step 5: Logout en `web/src/components/Navbar.jsx`**

Firma → `export default function Navbar({ screen, onChange, userEmail, onLogout })`. Añadir en la cabecera:
```jsx
        {userEmail && <button onClick={onLogout} title={userEmail} className="text-[11px] font-semibold text-muted hover:text-loss">Salir</button>}
```
En `App.jsx`, pasar props: `<Navbar screen={screen} onChange={setScreen} userEmail={useAuth.getState().user?.email} onLogout={useAuth((s)=>s.logout)} />` (o leer con selectores como en el resto).

- [ ] **Step 6: Build + humo**

`web/test/auth.smoke.mjs`:
```js
import { chromium } from 'playwright'
const base = process.env.SMOKE_URL || 'http://localhost:5173'
const email = `t${Date.now()}@ex.com`
const b = await chromium.launch(); const p = await b.newPage()
await p.goto(base); await p.getByText('Regístrate').click()
await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill('password123')
await p.getByRole('button', { name: 'Registrarme' }).click()
await p.waitForSelector('text=APEX TRADER FUNDING', { timeout: 10000 })
console.log('OK: registro entra al dashboard'); await b.close()
```
Run:
```bash
cd web && npm run build
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose up -d --build && sleep 10
cd web && node test/auth.smoke.mjs
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose down
```
Expected: `OK: registro entra al dashboard`.

- [ ] **Step 7: Commit**

```bash
git add web/src/api/client.js web/src/store/useAuth.js web/src/components/AuthScreen.jsx web/src/App.jsx web/src/components/Navbar.jsx web/test/auth.smoke.mjs
git commit -m "feat(web): cliente API, sesión, login/registro, guard"
```

---

# FASE 2 — Persistencia en API (cuenta activa)

**Entregable:** `calcFloor` por modo; rutas `state`/`trades`/`daily-records` con `?accountId`; el store deja `localStorage`; export CSV desde servidor; migración de datos locales.

### Task 2.1: `calcFloor(mode, …)` por modo de drawdown (frontend)

**Files:** Modify `web/src/utils/calculations.js`; Test `web/test/calcFloor.test.mjs`.
**Interfaces:** Produces `calcFloorByMode({ mode, peakBalance, currentBalance, initialBalance, maxDrawdown, dailyCloses }) -> number`. Reemplaza el uso directo de `calcFloor(peak,dd)` en Dashboard/FloorTracker/alertas.

- [ ] **Step 1: Test `web/test/calcFloor.test.mjs`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcFloorByMode } from '../src/utils/calculations.js'

const base = { initialBalance: 50000, maxDrawdown: 2000, currentBalance: 51000, peakBalance: 51000, dailyCloses: [] }

test('intraday: suelo = peak - dd, con flotante', () => {
  assert.equal(calcFloorByMode({ ...base, mode: 'intraday' }), 49000)
})
test('intraday: topa en initial+100 (safety net)', () => {
  assert.equal(calcFloorByMode({ ...base, mode: 'intraday', peakBalance: 60000, currentBalance: 60000 }), 50100)
})
test('static: suelo fijo = initial - dd', () => {
  assert.equal(calcFloorByMode({ ...base, mode: 'static', peakBalance: 60000 }), 48000)
})
test('eod: usa cierres diarios, no el flotante', () => {
  // sin cierres: peak eod = initial → suelo 48000, aunque el balance vivo sea 51000
  assert.equal(calcFloorByMode({ ...base, mode: 'eod', dailyCloses: [] }), 48000)
  // con un cierre a 50800: peak eod = 50800 → suelo 48800
  assert.equal(calcFloorByMode({ ...base, mode: 'eod', dailyCloses: [50800] }), 48800)
})
```

- [ ] **Step 2: Ejecutar y ver fallo** — Run: `cd web && node --test test/calcFloor.test.mjs`. Expected: FAIL (función no existe).

- [ ] **Step 3: Añadir `calcFloorByMode` a `web/src/utils/calculations.js`**

```js
// Suelo según el modo de drawdown. safetyNet = initialBalance + 100 (tope del trailing).
export function calcFloorByMode({ mode, peakBalance, currentBalance, initialBalance, maxDrawdown, dailyCloses = [] }) {
  const dd = num(maxDrawdown)
  const init = num(initialBalance)
  if (mode === 'static') return init - dd
  const cap = init + 100
  if (mode === 'eod') {
    const peakEod = Math.max(init, ...dailyCloses.map(num))
    return Math.min(peakEod - dd, cap)
  }
  // intraday (por defecto): el peak incluye el balance vivo
  const peak = Math.max(num(peakBalance), num(currentBalance), init)
  return Math.min(peak - dd, cap)
}
```

- [ ] **Step 4: Ejecutar y ver pasar** — Run: `cd web && node --test test/calcFloor.test.mjs`. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/calculations.js web/test/calcFloor.test.mjs
git commit -m "feat(web): calcFloorByMode para intraday/eod/static con safety net"
```

### Task 2.2: Guard de cuenta + rutas de estado (`/api/state`)

**Files:** Create `server/src/accounts/guard.js`, `server/src/routes/state.js`; Modify `server/src/app.js`; Test `server/test/state.test.js`.
**Interfaces:** Produces `resolveAccount(userId, accountId) -> account|null` (guard.js: valida pertenencia; si `accountId` es null usa la activa); `rowToAccount(r)`; `GET /api/state -> { account }` (la cuenta activa completa en camelCase).

- [ ] **Step 1: Test `server/test/state.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'
let app, token
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(async () => {
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
  token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })).json().accessToken
})
const auth = () => ({ authorization: `Bearer ${token}` })

test('GET /api/state devuelve la cuenta activa 50K intraday', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/state', headers: auth() })
  assert.equal(res.statusCode, 200)
  const a = res.json().account
  assert.equal(a.drawdownMode, 'intraday')
  assert.equal(a.initialBalance, 50000)
  assert.equal(a.maxContracts, 6)
})
test('sin token da 401', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/state' })).statusCode, 401)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/state.test.js
```
Expected: FAIL (404).

- [ ] **Step 3: `server/src/accounts/guard.js`**

```js
import { query } from '../db.js'

export function rowToAccount(r) {
  const d = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)
  return {
    id: r.id, name: r.name, drawdownMode: r.drawdown_mode, sizeLabel: r.size_label,
    initialBalance: Number(r.initial_balance), maxDrawdown: Number(r.max_drawdown),
    profitTarget: Number(r.profit_target), maxContracts: r.max_contracts,
    evalDays: r.eval_days, startDate: d(r.start_date),
    currentBalance: Number(r.current_balance), peakBalance: Number(r.peak_balance),
    riskPerTrade: Number(r.risk_per_trade), dailyStopLimit: Number(r.daily_stop_limit),
    minRR: Number(r.min_rr), maxTradesPerDay: r.max_trades_per_day,
    defaultContracts: r.default_contracts, defaultInstrument: r.default_instrument,
    accountKind: r.account_kind,
  }
}

// Devuelve la cuenta (fila) si pertenece al usuario; si accountId es falsy, la activa.
export async function resolveAccount(userId, accountId) {
  if (accountId) {
    const r = await query('SELECT * FROM accounts WHERE id=$1 AND user_id=$2', [accountId, userId])
    return r.rows[0] || null
  }
  const r = await query(
    'SELECT a.* FROM accounts a JOIN users u ON u.active_account_id=a.id WHERE u.id=$1',
    [userId],
  )
  return r.rows[0] || null
}
```

- [ ] **Step 4: `server/src/routes/state.js`**

```js
import { resolveAccount, rowToAccount } from '../accounts/guard.js'
export async function stateRoutes(app) {
  app.get('/state', async (req, reply) => {
    const acc = await resolveAccount(req.userId, req.query.accountId)
    if (!acc) return reply.code(404).send({ error: 'no_account', message: 'Sin cuenta activa' })
    reply.send({ account: rowToAccount(acc) })
  })
}
```

- [ ] **Step 5: Registrar bloque `/api` en `app.js`**

Importar `import { requireAuth } from './auth/requireAuth.js'` y `import { stateRoutes } from './routes/state.js'`. Antes de `/health`:
```js
  app.register(async (api) => {
    api.addHook('preHandler', requireAuth)
    await stateRoutes(api)
  }, { prefix: '/api' })
```

- [ ] **Step 6: Ejecutar y ver pasar** — Run: `cd server && node --test test/state.test.js`. Expected: PASS.

- [ ] **Step 7: Parar y commit**

```bash
docker stop apex-pg-test
git add server/src/accounts/guard.js server/src/routes/state.js server/src/app.js server/test/state.test.js
git commit -m "feat(server): guard de cuenta + GET /api/state de la cuenta activa"
```

### Task 2.3: Rutas de trades (CRUD + export) scopeadas por cuenta

**Files:** Create `server/src/routes/trades.js`; Modify `server/src/app.js`; Test `server/test/trades.test.js`.
**Interfaces:** Produces `rowToTrade(r)`; rutas con `?accountId`: `GET/POST /trades`, `PATCH/DELETE /trades/:id`, `GET /trades/export.csv`. Todas validan cuenta→usuario con `resolveAccount`.

- [ ] **Step 1: Test `server/test/trades.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'
let app, token, accountId
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(async () => {
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
  token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })).json().accessToken
  accountId = (await app.inject({ method: 'GET', url: '/api/state', headers: auth() })).json().account.id
})
const auth = () => ({ authorization: `Bearer ${token}` })
const sample = { date: '2026-07-23', time: '16:40', instrument: 'MNQ', direction: 'LONG', contracts: 1, result: 'WIN', pnl: 100, points: 50, strategy: 'ORB', notes: '' }

test('crear, listar, editar y borrar trade en la cuenta', async () => {
  const c = await app.inject({ method: 'POST', url: `/api/trades?accountId=${accountId}`, headers: auth(), payload: sample })
  assert.equal(c.statusCode, 201)
  const id = c.json().trade.id
  assert.equal((await app.inject({ method: 'GET', url: `/api/trades?accountId=${accountId}`, headers: auth() })).json().trades.length, 1)
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/trades/${id}`, headers: auth(), payload: { notes: 'ok' } })).json().trade.notes, 'ok')
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/trades/${id}`, headers: auth() })).statusCode, 204)
})
test('export.csv', async () => {
  await app.inject({ method: 'POST', url: `/api/trades?accountId=${accountId}`, headers: auth(), payload: sample })
  const res = await app.inject({ method: 'GET', url: `/api/trades/export.csv?accountId=${accountId}`, headers: auth() })
  assert.match(res.headers['content-type'], /text\/csv/)
  assert.match(res.body, /Fecha,Hora,Instrumento/)
})
test('accountId ajeno da 404', async () => {
  assert.equal((await app.inject({ method: 'GET', url: `/api/trades?accountId=00000000-0000-0000-0000-000000000000`, headers: auth() })).statusCode, 404)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/trades.test.js
```
Expected: FAIL (404 rutas).

- [ ] **Step 3: `server/src/routes/trades.js`**

```js
import { query } from '../db.js'
import { resolveAccount } from '../accounts/guard.js'

export function rowToTrade(r) {
  return {
    id: r.id, accountId: r.account_id,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
    time: r.time, instrument: r.instrument, direction: r.direction, contracts: r.contracts,
    result: r.result, pnl: Number(r.pnl), points: r.points == null ? null : Number(r.points),
    strategy: r.strategy || '', notes: r.notes || '', source: r.source, importBatchId: r.import_batch_id,
  }
}
const tradeBody = {
  type: 'object',
  properties: {
    date: { type: 'string' }, time: { type: 'string' }, instrument: { type: 'string' },
    direction: { type: 'string', enum: ['LONG', 'SHORT'] }, contracts: { type: 'integer', minimum: 1, maximum: 40 },
    result: { type: 'string', enum: ['WIN', 'LOSS', 'BE'] }, pnl: { type: 'number' },
    points: { type: ['number', 'null'] }, strategy: { type: 'string' }, notes: { type: 'string' },
  },
}
// helper: exige cuenta válida; devuelve fila o manda 404
async function need(req, reply) {
  const acc = await resolveAccount(req.userId, req.query.accountId)
  if (!acc) { reply.code(404).send({ error: 'no_account', message: 'Cuenta no encontrada' }); return null }
  return acc
}

export async function tradesRoutes(app) {
  app.get('/trades', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const { from, to } = req.query
    const params = [acc.id]; const clauses = ['account_id=$1']
    if (from) { params.push(from); clauses.push(`date >= $${params.length}`) }
    if (to) { params.push(to); clauses.push(`date <= $${params.length}`) }
    const r = await query(`SELECT * FROM trades WHERE ${clauses.join(' AND ')} ORDER BY date, time`, params)
    return { trades: r.rows.map(rowToTrade) }
  })

  app.post('/trades', { schema: { body: { ...tradeBody, required: ['date', 'instrument', 'direction', 'result'] } } }, async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const t = req.body
    const r = await query(
      `INSERT INTO trades(account_id,user_id,date,time,instrument,direction,contracts,result,pnl,points,strategy,notes,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual') RETURNING *`,
      [acc.id, req.userId, t.date, t.time || null, t.instrument, t.direction, t.contracts || 1, t.result, t.pnl || 0, t.points ?? null, t.strategy || '', t.notes || ''],
    )
    reply.code(201).send({ trade: rowToTrade(r.rows[0]) })
  })

  app.patch('/trades/:id', { schema: { body: tradeBody } }, async (req, reply) => {
    const fields = ['date', 'time', 'instrument', 'direction', 'contracts', 'result', 'pnl', 'points', 'strategy', 'notes']
    const entries = fields.filter((f) => f in (req.body || {}))
    if (!entries.length) return reply.code(400).send({ error: 'empty', message: 'Nada que actualizar' })
    const sets = entries.map((f, i) => `${f}=$${i + 3}`).join(', ')
    const vals = entries.map((f) => req.body[f])
    // join a accounts para validar propiedad por user_id
    const r = await query(
      `UPDATE trades SET ${sets} WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.userId, ...vals],
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Trade no encontrado' })
    reply.send({ trade: rowToTrade(r.rows[0]) })
  })

  app.delete('/trades/:id', async (req, reply) => {
    const r = await query('DELETE FROM trades WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Trade no encontrado' })
    reply.code(204).send()
  })

  app.get('/trades/export.csv', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const r = await query('SELECT * FROM trades WHERE account_id=$1 ORDER BY date, time', [acc.id])
    const header = ['Fecha', 'Hora', 'Instrumento', 'Direccion', 'Contratos', 'Resultado', 'PnL', 'Puntos', 'Estrategia', 'Notas']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [header.map(esc).join(',')]
    for (const row of r.rows) {
      const t = rowToTrade(row)
      lines.push([t.date, t.time, t.instrument, t.direction, t.contracts, t.result, t.pnl, t.points ?? '', t.strategy, t.notes].map(esc).join(','))
    }
    reply.header('content-type', 'text/csv;charset=utf-8')
    reply.header('content-disposition', 'attachment; filename="apex-trades.csv"')
    reply.send(lines.join('\n'))
  })
}
```

- [ ] **Step 4: Registrar en `app.js`** — dentro del bloque `/api`: `await tradesRoutes(api)`; import `import { tradesRoutes } from './routes/trades.js'`.

- [ ] **Step 5: Ejecutar y ver pasar** — Run: `cd server && node --test test/trades.test.js`. Expected: PASS.

- [ ] **Step 6: Parar y commit**

```bash
docker stop apex-pg-test
git add server/src/routes/trades.js server/src/app.js server/test/trades.test.js
git commit -m "feat(server): CRUD trades + export por cuenta (?accountId)"
```

### Task 2.4: Rutas daily-records + test de aislamiento

**Files:** Create `server/src/routes/dailyRecords.js`, `server/test/isolation.test.js`; Modify `server/src/app.js`; Test `server/test/dailyRecords.test.js`.
**Interfaces:** Produces `rowToRecord(r)`; `GET/POST /daily-records?accountId`, `DELETE /daily-records/:id`.

- [ ] **Step 1: Test `server/test/dailyRecords.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'
let app, token, accountId
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(async () => {
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
  token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })).json().accessToken
  accountId = (await app.inject({ method: 'GET', url: '/api/state', headers: { authorization: `Bearer ${token}` } })).json().account.id
})
const auth = () => ({ authorization: `Bearer ${token}` })

test('upsert por fecha no duplica', async () => {
  await app.inject({ method: 'POST', url: `/api/daily-records?accountId=${accountId}`, headers: auth(), payload: { date: '2026-07-23', open: 50000, close: 50200 } })
  await app.inject({ method: 'POST', url: `/api/daily-records?accountId=${accountId}`, headers: auth(), payload: { date: '2026-07-23', open: 50000, close: 50350 } })
  const l = await app.inject({ method: 'GET', url: `/api/daily-records?accountId=${accountId}`, headers: auth() })
  assert.equal(l.json().records.length, 1)
  assert.equal(l.json().records[0].close, 50350)
})
```

- [ ] **Step 2: Test `server/test/isolation.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'
let app
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(() => query('TRUNCATE users RESTART IDENTITY CASCADE'))
async function reg(email) {
  const t = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } })).json().accessToken
  const acc = (await app.inject({ method: 'GET', url: '/api/state', headers: { authorization: `Bearer ${t}` } })).json().account.id
  return { t, acc }
}

test('un usuario no puede usar la cuenta de otro', async () => {
  const a = await reg('a@b.com'); const b = await reg('c@d.com')
  // b intenta crear trade en la cuenta de a
  const res = await app.inject({ method: 'POST', url: `/api/trades?accountId=${a.acc}`, headers: { authorization: `Bearer ${b.t}` }, payload: { date: '2026-07-23', instrument: 'MNQ', direction: 'LONG', result: 'WIN', pnl: 100, contracts: 1 } })
  assert.equal(res.statusCode, 404)
})
test('no se ve ni se borra un trade de otro', async () => {
  const a = await reg('a@b.com'); const b = await reg('c@d.com')
  const c = await app.inject({ method: 'POST', url: `/api/trades?accountId=${a.acc}`, headers: { authorization: `Bearer ${a.t}` }, payload: { date: '2026-07-23', instrument: 'MNQ', direction: 'LONG', result: 'WIN', pnl: 100, contracts: 1 } })
  const id = c.json().trade.id
  assert.equal((await app.inject({ method: 'GET', url: `/api/trades?accountId=${b.acc}`, headers: { authorization: `Bearer ${b.t}` } })).json().trades.length, 0)
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/trades/${id}`, headers: { authorization: `Bearer ${b.t}` } })).statusCode, 404)
})
```

- [ ] **Step 3: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/dailyRecords.test.js
```
Expected: FAIL (daily-records 404). El de aislamiento de trades ya pasa.

- [ ] **Step 4: `server/src/routes/dailyRecords.js`**

```js
import { query } from '../db.js'
import { resolveAccount } from '../accounts/guard.js'
export function rowToRecord(r) {
  return { id: r.id, accountId: r.account_id, date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date, open: r.open == null ? null : Number(r.open), close: Number(r.close), note: r.note || '' }
}
async function need(req, reply) {
  const acc = await resolveAccount(req.userId, req.query.accountId)
  if (!acc) { reply.code(404).send({ error: 'no_account', message: 'Cuenta no encontrada' }); return null }
  return acc
}
export async function dailyRecordsRoutes(app) {
  app.get('/daily-records', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const r = await query('SELECT * FROM daily_records WHERE account_id=$1 ORDER BY date', [acc.id])
    return { records: r.rows.map(rowToRecord) }
  })
  app.post('/daily-records', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const { date, open, close, note } = req.body || {}
    const r = await query(
      `INSERT INTO daily_records(account_id,user_id,date,open,close,note) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (account_id,date) DO UPDATE SET open=EXCLUDED.open, close=EXCLUDED.close, note=EXCLUDED.note RETURNING *`,
      [acc.id, req.userId, date, open ?? null, close, note || ''],
    )
    reply.send({ record: rowToRecord(r.rows[0]) })
  })
  app.delete('/daily-records/:id', async (req, reply) => {
    const r = await query('DELETE FROM daily_records WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Registro no encontrado' })
    reply.code(204).send()
  })
}
```

- [ ] **Step 5: Registrar en `app.js`** — `await dailyRecordsRoutes(api)`; import correspondiente.

- [ ] **Step 6: Ejecutar toda la suite** — Run: `cd server && node --test test/`. Expected: PASS. Parar: `docker stop apex-pg-test`.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/dailyRecords.js server/src/app.js server/test/dailyRecords.test.js server/test/isolation.test.js
git commit -m "feat(server): daily-records por cuenta + tests de aislamiento"
```

### Task 2.5: Frontend — endpoints, store sin localStorage, floor por modo

**Files:** Create `web/src/api/endpoints.js`; Modify `web/src/store/useStore.js`, `web/src/App.jsx`, `web/src/store/useAccount.js`, `web/src/components/Settings.jsx`.
**Interfaces:** Produces endpoints por recurso con `accountId`; `useStore` gana `hydrate(accountId)`; `useAccount` usa `calcFloorByMode` con `drawdownMode` y `dailyCloses`.

- [ ] **Step 1: `web/src/api/endpoints.js`**

```js
import { apiFetch } from './client'
const qs = (accountId) => `?accountId=${encodeURIComponent(accountId)}`
export const getState = (accountId) => apiFetch(`/api/state${accountId ? qs(accountId) : ''}`)
export const listTrades = (accountId) => apiFetch(`/api/trades${qs(accountId)}`)
export const createTrade = (accountId, t) => apiFetch(`/api/trades${qs(accountId)}`, { method: 'POST', body: t })
export const patchTrade = (id, p) => apiFetch(`/api/trades/${id}`, { method: 'PATCH', body: p })
export const deleteTradeApi = (id) => apiFetch(`/api/trades/${id}`, { method: 'DELETE' })
export const listDailyRecords = (accountId) => apiFetch(`/api/daily-records${qs(accountId)}`)
export const upsertDailyRecord = (accountId, r) => apiFetch(`/api/daily-records${qs(accountId)}`, { method: 'POST', body: r })
export const deleteDailyRecordApi = (id) => apiFetch(`/api/daily-records/${id}`, { method: 'DELETE' })
```

- [ ] **Step 2: Reescribir `web/src/store/useStore.js` sin `persist`** (fuente de verdad = API, cuenta activa)

Puntos clave (mantener `DEFAULT_SETTINGS`/`SETTINGS_RANGES` como constantes locales para la UI):
```js
import { create } from 'zustand'
import * as api from '../api/endpoints'
import { num } from '../utils/calculations'

export const useStore = create((set, get) => ({
  account: null,          // la cuenta activa completa (settings + estado)
  trades: [], dailyRecords: [], checklist: {}, lastCalc: null, hydrated: false,

  async hydrate(accountId) {
    const [{ account }, { trades }, { records }] = await Promise.all([
      api.getState(accountId), api.listTrades(accountId), api.listDailyRecords(accountId),
    ])
    set({ account, trades, dailyRecords: records, hydrated: true })
  },
  resetForAccountSwitch() { set({ hydrated: false, account: null, trades: [], dailyRecords: [] }) },

  async setBalance(value) {
    const a = get().account; const balance = num(value)
    const peak = Math.max(balance, num(a.peakBalance), num(a.initialBalance))
    set({ account: { ...a, currentBalance: balance, peakBalance: peak } })
    await api.patchAccount(a.id, { currentBalance: balance, peakBalance: peak })
  },
  async updateSettings(patch) {
    const a = get().account; const next = { ...a, ...patch }
    set({ account: next })
    await api.patchAccount(a.id, patch)
  },
  async addTrade(trade) {
    const a = get().account
    const { trade: created } = await api.createTrade(a.id, { ...trade, pnl: num(trade.pnl), contracts: num(trade.contracts, 1) })
    set((s) => ({ trades: [...s.trades, created] }))
  },
  async updateTrade(id, patch) { const { trade } = await api.patchTrade(id, patch); set((s) => ({ trades: s.trades.map((t) => (t.id === id ? trade : t)) })) },
  async deleteTrade(id) { await api.deleteTradeApi(id); set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })) },
  async addDailyRecord(record) {
    const a = get().account
    const { record: saved } = await api.upsertDailyRecord(a.id, record)
    set((s) => ({ dailyRecords: [...s.dailyRecords.filter((r) => r.date !== saved.date), saved] }))
  },
  async deleteDailyRecord(id) { await api.deleteDailyRecordApi(id); set((s) => ({ dailyRecords: s.dailyRecords.filter((r) => r.id !== id) })) },
  toggleChecklist(i) { set((s) => ({ checklist: { ...s.checklist, [i]: !s.checklist[i] } })) },
  resetChecklist() { set({ checklist: {} }) },
  setLastCalc(c) { set({ lastCalc: c }) },
}))
```
> Nota: para que la Fase 2 quede funcional se necesita ya la ruta `PATCH /api/accounts/:id`. Se crea
> **en esta tarea** un `server/src/routes/accounts.js` mínimo con SOLO el handler PATCH (código
> idéntico al `app.patch('/accounts/:id', …)` de la Task 3.1, incluido el mapa `EDITABLE` y el import
> de `rowToAccount`), y se registra en el bloque `/api` de `app.js`. La Task 3.1 **amplía** ese mismo
> fichero con list/create/activate/delete/reset-preset. Añadir a `endpoints.js`:
```js
export const patchAccount = (id, patch) => apiFetch(`/api/accounts/${id}`, { method: 'PATCH', body: patch })
```

- [ ] **Step 3: `useAccount.js` usa `calcFloorByMode`**

En `web/src/store/useAccount.js`, derivar del store `account` (ya no `settings`/`currentBalance` sueltos). Calcular el suelo:
```js
import { calcFloorByMode } from '../utils/calculations'
// ...
const a = useStore((s) => s.account)
const dailyRecords = useStore((s) => s.dailyRecords)
// dentro del useMemo:
const dailyCloses = dailyRecords.map((r) => r.close)
const floor = calcFloorByMode({
  mode: a.drawdownMode, peakBalance: a.peakBalance, currentBalance: a.currentBalance,
  initialBalance: a.initialBalance, maxDrawdown: a.maxDrawdown, dailyCloses,
})
```
Adaptar el resto de campos (`settings.*` → `a.*`). Mantener los mismos nombres de salida que consumen las pantallas.

- [ ] **Step 4: `App.jsx` hidrata la cuenta activa**

```jsx
  const hydrate = useStore((s) => s.hydrate)
  const hydrated = useStore((s) => s.hydrated)
  const activeAccountId = useAuth((s) => s.activeAccountId)
  useEffect(() => { if (authStatus === 'authenticated' && activeAccountId && !hydrated) hydrate(activeAccountId) }, [authStatus, activeAccountId, hydrated, hydrate])
  // no renderizar pantallas hasta hydrated:
  if (authStatus === 'authenticated' && !hydrated) return <div className="min-h-screen flex items-center justify-center text-muted">Cargando cuenta…</div>
```

- [ ] **Step 5: `Settings.jsx`** — editar la cuenta activa (todos los campos), quitar acciones de localStorage; export CSV vía `${API_BASE}/api/trades/export.csv?accountId=` descargado con token. (El botón "restaurar preset" llega en Fase 3.)

- [ ] **Step 6: Build + humo**

```bash
cd web && npm run build
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose up -d --build && sleep 10
cd web && node test/auth.smoke.mjs
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose down
```
Expected: build OK y humo OK.

- [ ] **Step 7: Commit**

```bash
git add web/src/api/endpoints.js web/src/store/useStore.js web/src/store/useAccount.js web/src/App.jsx web/src/components/Settings.jsx
git commit -m "feat(web): store contra API por cuenta, floor por modo, sin localStorage"
```

### Task 2.6: Migración de datos locales al primer login

**Files:** Create `web/src/api/migrateLocal.js`; Modify `web/src/App.jsx`.
**Interfaces:** Produces `hasLegacyData()`, `migrateLegacyData(accountId)` que sube settings/balance/trades/daily-records de la clave `apex-dashboard-v1` a la cuenta activa y borra la clave.

- [ ] **Step 1: `web/src/api/migrateLocal.js`**

```js
import * as api from './endpoints'
const KEY = 'apex-dashboard-v1'
export function hasLegacyData() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return !!(d?.state?.trades?.length || d?.state?.dailyRecords?.length) } catch { return false }
}
export async function migrateLegacyData(accountId) {
  const d = JSON.parse(localStorage.getItem(KEY)); const st = d.state || {}
  if (st.settings) await api.patchAccount(accountId, st.settings)
  if (st.currentBalance != null) await api.patchAccount(accountId, { currentBalance: st.currentBalance, peakBalance: st.peakBalance })
  for (const t of st.trades || []) { const { id, source, importBatchId, ...rest } = t; await api.createTrade(accountId, rest) }
  for (const r of st.dailyRecords || []) { const { id, ...rest } = r; await api.upsertDailyRecord(accountId, rest) }
  localStorage.removeItem(KEY)
}
```

- [ ] **Step 2: Banner en `App.jsx`** — si `hasLegacyData()`, mostrar `NoteBox` con botón "Importar mis datos anteriores" → `migrateLegacyData(activeAccountId)` + `hydrate(activeAccountId)`.

- [ ] **Step 3: Build** — Run: `cd web && npm run build`. Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add web/src/api/migrateLocal.js web/src/App.jsx
git commit -m "feat(web): migración opcional de datos localStorage a la cuenta"
```

---

# FASE 3 — Multi-cuenta (selector + presets + modos)

**Entregable:** CRUD de cuentas, activar, restaurar preset; selector en la Navbar; alta con presets editables; Settings por cuenta.

### Task 3.1: Rutas `/api/accounts` (list, create, activate, delete, reset-preset)

**Files:** Modify `server/src/routes/accounts.js` (creado en Task 2.5 con el PATCH; aquí se añaden el
resto de handlers); Test `server/test/accounts.test.js`.
**Interfaces:** Produces `GET /accounts`, `POST /accounts`, `POST /accounts/:id/activate`,
`DELETE /accounts/:id`, `GET /accounts/:id/reset-preset` (el `PATCH /accounts/:id` ya existe de 2.5).
El bloque de código de esta tarea incluye el `app.patch` de nuevo por completitud; si ya está de la
Task 2.5, no duplicarlo — dejar una sola definición.

- [ ] **Step 1: Test `server/test/accounts.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'
let app, token
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(async () => {
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
  token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })).json().accessToken
})
const auth = () => ({ authorization: `Bearer ${token}` })

test('lista la cuenta por defecto', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/accounts', headers: auth() })
  assert.equal(r.json().accounts.length, 1)
  assert.ok(r.json().activeAccountId)
})
test('crear cuenta EOD 100K desde preset, editable', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/accounts', headers: auth(), payload: { name: 'Mi 100K EOD', drawdownMode: 'eod', sizeLabel: '100K', maxDrawdown: 3100 } })
  assert.equal(r.statusCode, 201)
  const a = r.json().account
  assert.equal(a.drawdownMode, 'eod')
  assert.equal(a.initialBalance, 100000)  // del preset
  assert.equal(a.maxDrawdown, 3100)       // override respetado
  assert.equal(a.maxContracts, 8)         // del preset
})
test('activar cuenta cambia active_account_id', async () => {
  const created = (await app.inject({ method: 'POST', url: '/api/accounts', headers: auth(), payload: { name: 'x', drawdownMode: 'static', sizeLabel: '100K-static' } })).json().account
  await app.inject({ method: 'POST', url: `/api/accounts/${created.id}/activate`, headers: auth() })
  const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth() })
  assert.equal(me.json().activeAccountId, created.id)
})
test('reset-preset devuelve valores del size_label', async () => {
  const acc = (await app.inject({ method: 'GET', url: '/api/accounts', headers: auth() })).json().accounts[0]
  const r = await app.inject({ method: 'GET', url: `/api/accounts/${acc.id}/reset-preset`, headers: auth() })
  assert.equal(r.json().preset.maxContracts, 6)
})
test('patch edita y borrar respeta que quede al menos una activa', async () => {
  const acc2 = (await app.inject({ method: 'POST', url: '/api/accounts', headers: auth(), payload: { name: 'seg', drawdownMode: 'intraday', sizeLabel: '25K' } })).json().account
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/accounts/${acc2.id}`, headers: auth(), payload: { riskPerTrade: 120 } })).json().account.riskPerTrade, 120)
  const acc1 = (await app.inject({ method: 'GET', url: '/api/accounts', headers: auth() })).json().accounts.find((a) => a.id !== acc2.id)
  await app.inject({ method: 'DELETE', url: `/api/accounts/${acc1.id}`, headers: auth() })
  const list = await app.inject({ method: 'GET', url: '/api/accounts', headers: auth() })
  assert.equal(list.json().accounts.length, 1)
  assert.ok(list.json().activeAccountId) // sigue habiendo activa
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/accounts.test.js
```
Expected: FAIL (404).

- [ ] **Step 3: `server/src/routes/accounts.js`**

```js
import { query, getPool } from '../db.js'
import { presetFor, DRAWDOWN_MODES } from '../accounts/presets.js'
import { rowToAccount } from '../accounts/guard.js'

const EDITABLE = {
  name: 'name', drawdownMode: 'drawdown_mode', sizeLabel: 'size_label',
  initialBalance: 'initial_balance', maxDrawdown: 'max_drawdown', profitTarget: 'profit_target',
  maxContracts: 'max_contracts', evalDays: 'eval_days', startDate: 'start_date',
  currentBalance: 'current_balance', peakBalance: 'peak_balance', riskPerTrade: 'risk_per_trade',
  dailyStopLimit: 'daily_stop_limit', minRR: 'min_rr', maxTradesPerDay: 'max_trades_per_day',
  defaultContracts: 'default_contracts', defaultInstrument: 'default_instrument', accountKind: 'account_kind',
}

export async function accountsRoutes(app) {
  app.get('/accounts', async (req) => {
    const r = await query('SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at', [req.userId])
    const u = await query('SELECT active_account_id FROM users WHERE id=$1', [req.userId])
    return { accounts: r.rows.map(rowToAccount), activeAccountId: u.rows[0].active_account_id }
  })

  app.post('/accounts', async (req, reply) => {
    const b = req.body || {}
    if (!DRAWDOWN_MODES.includes(b.drawdownMode)) return reply.code(400).send({ error: 'bad_mode', message: 'Modo de drawdown no válido' })
    const preset = presetFor(b.sizeLabel) || {}
    const merged = {
      name: b.name || 'Mi cuenta', drawdown_mode: b.drawdownMode, size_label: b.sizeLabel || null,
      initial_balance: b.initialBalance ?? preset.initialBalance ?? 50000,
      max_drawdown: b.maxDrawdown ?? preset.maxDrawdown ?? 2000,
      profit_target: b.profitTarget ?? preset.profitTarget ?? 3000,
      max_contracts: b.maxContracts ?? preset.maxContracts ?? 6,
    }
    const init = merged.initial_balance
    const client = await getPool().connect()
    let acc
    try {
      await client.query('BEGIN')
      acc = (await client.query(
        `INSERT INTO accounts(user_id,name,drawdown_mode,size_label,initial_balance,max_drawdown,profit_target,max_contracts,current_balance,peak_balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$5,$5) RETURNING *`,
        [req.userId, merged.name, merged.drawdown_mode, merged.size_label, init, merged.max_drawdown, merged.profit_target, merged.max_contracts],
      )).rows[0]
      // si el usuario no tenía activa, activar esta
      await client.query('UPDATE users SET active_account_id=COALESCE(active_account_id,$2) WHERE id=$1', [req.userId, acc.id])
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    reply.code(201).send({ account: rowToAccount(acc) })
  })

  app.patch('/accounts/:id', async (req, reply) => {
    const entries = Object.entries(req.body || {}).filter(([k]) => EDITABLE[k])
    if (!entries.length) return reply.code(400).send({ error: 'empty', message: 'Nada que actualizar' })
    const sets = entries.map(([k], i) => `${EDITABLE[k]}=$${i + 3}`).join(', ')
    const vals = entries.map(([, v]) => v)
    const r = await query(`UPDATE accounts SET ${sets} WHERE id=$1 AND user_id=$2 RETURNING *`, [req.params.id, req.userId, ...vals])
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Cuenta no encontrada' })
    reply.send({ account: rowToAccount(r.rows[0]) })
  })

  app.post('/accounts/:id/activate', async (req, reply) => {
    const own = await query('SELECT 1 FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!own.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Cuenta no encontrada' })
    await query('UPDATE users SET active_account_id=$2 WHERE id=$1', [req.userId, req.params.id])
    reply.send({ activeAccountId: req.params.id })
  })

  app.get('/accounts/:id/reset-preset', async (req, reply) => {
    const r = await query('SELECT size_label FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Cuenta no encontrada' })
    const preset = presetFor(r.rows[0].size_label)
    if (!preset) return reply.code(404).send({ error: 'no_preset', message: 'Esa cuenta no tiene preset asociado' })
    reply.send({ preset })
  })

  app.delete('/accounts/:id', async (req, reply) => {
    const own = await query('SELECT 1 FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!own.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Cuenta no encontrada' })
    const count = await query('SELECT count(*)::int AS n FROM accounts WHERE user_id=$1', [req.userId])
    if (count.rows[0].n <= 1) return reply.code(400).send({ error: 'last_account', message: 'No puedes borrar tu única cuenta' })
    await query('DELETE FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    // reactivar otra si era la activa
    await query(
      `UPDATE users SET active_account_id=(SELECT id FROM accounts WHERE user_id=$1 ORDER BY created_at LIMIT 1)
       WHERE id=$1 AND (active_account_id IS NULL OR active_account_id=$2)`,
      [req.userId, req.params.id],
    )
    reply.code(204).send()
  })
}
```

- [ ] **Step 4: Registrar en `app.js`** — `await accountsRoutes(api)`; import.

- [ ] **Step 5: Ejecutar y ver pasar** — Run: `cd server && node --test test/accounts.test.js`. Expected: PASS (5 tests). Parar Postgres.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/accounts.js server/src/app.js server/test/accounts.test.js
git commit -m "feat(server): CRUD de cuentas + activar + reset-preset"
```

### Task 3.2: Frontend — store de cuentas y selector en la Navbar

**Files:** Create `web/src/store/useAccounts.js`, `web/src/components/AccountSwitcher.jsx`, `web/src/data/apexPresets.js`; Modify `web/src/components/Navbar.jsx`, `web/src/api/endpoints.js`.
**Interfaces:** Produces `useAccounts` con `{accounts, activeId, load(), activate(id), create(payload), remove(id)}`; `AccountSwitcher` desplegable + "Nueva cuenta".

- [ ] **Step 1: `web/src/data/apexPresets.js`** (espejo del servidor)

```js
export const PRESETS = {
  '25K': { initialBalance: 25000, maxDrawdown: 1500, profitTarget: 1500, maxContracts: 4 },
  '50K': { initialBalance: 50000, maxDrawdown: 2000, profitTarget: 3000, maxContracts: 6 },
  '50K-legacy': { initialBalance: 50000, maxDrawdown: 2500, profitTarget: 3000, maxContracts: 10 },
  '75K': { initialBalance: 75000, maxDrawdown: 2750, profitTarget: 4500, maxContracts: 12 },
  '100K': { initialBalance: 100000, maxDrawdown: 3000, profitTarget: 6000, maxContracts: 8 },
  '150K': { initialBalance: 150000, maxDrawdown: 4000, profitTarget: 9000, maxContracts: 12 },
  '250K': { initialBalance: 250000, maxDrawdown: 6500, profitTarget: 15000, maxContracts: 17 },
  '300K': { initialBalance: 300000, maxDrawdown: 7500, profitTarget: 20000, maxContracts: 20 },
  '100K-static': { initialBalance: 100000, maxDrawdown: 625, profitTarget: 2000, maxContracts: 2 },
}
export const DRAWDOWN_MODES = [
  { value: 'intraday', label: 'Intraday trailing', hint: 'El suelo sube con el flotante' },
  { value: 'eod', label: 'EOD trailing', hint: 'El suelo solo sube con el cierre diario' },
  { value: 'static', label: 'Static', hint: 'Suelo fijo, no traila' },
]
```

- [ ] **Step 2: Endpoints de cuentas en `endpoints.js`**

```js
export const listAccounts = () => apiFetch('/api/accounts')
export const createAccount = (payload) => apiFetch('/api/accounts', { method: 'POST', body: payload })
export const activateAccount = (id) => apiFetch(`/api/accounts/${id}/activate`, { method: 'POST' })
export const deleteAccount = (id) => apiFetch(`/api/accounts/${id}`, { method: 'DELETE' })
export const resetPreset = (id) => apiFetch(`/api/accounts/${id}/reset-preset`)
```

- [ ] **Step 3: `web/src/store/useAccounts.js`**

```js
import { create } from 'zustand'
import * as api from '../api/endpoints'
import { useAuth } from './useAuth'
import { useStore } from './useStore'
export const useAccounts = create((set, get) => ({
  accounts: [], activeId: null,
  async load() { const { accounts, activeAccountId } = await api.listAccounts(); set({ accounts, activeId: activeAccountId }) },
  async activate(id) {
    await api.activateAccount(id)
    useAuth.getState().setActiveAccountId(id)
    set({ activeId: id })
    useStore.getState().resetForAccountSwitch()
    await useStore.getState().hydrate(id)
  },
  async create(payload) {
    const { account } = await api.createAccount(payload)
    await get().load()
    return account
  },
  async remove(id) { await api.deleteAccount(id); await get().load() },
}))
```

- [ ] **Step 4: `web/src/components/AccountSwitcher.jsx`** — desplegable con `accounts` (nombre + modo + tamaño), marca la activa, entrada "➕ Nueva cuenta" que abre `NewAccountModal` (Task 3.3). Al elegir otra, `activate(id)`.

- [ ] **Step 5: Integrar en `Navbar.jsx`** — renderizar `<AccountSwitcher />` en la cabecera; cargar `useAccounts().load()` al montar (en `App.jsx` tras hydrate).

- [ ] **Step 6: Build** — Run: `cd web && npm run build`. Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add web/src/data/apexPresets.js web/src/store/useAccounts.js web/src/components/AccountSwitcher.jsx web/src/components/Navbar.jsx web/src/api/endpoints.js web/src/App.jsx
git commit -m "feat(web): store de cuentas + selector en la navbar"
```

### Task 3.3: Frontend — alta de cuenta con presets editables + Settings por cuenta

**Files:** Create `web/src/components/NewAccountModal.jsx`; Modify `web/src/components/Settings.jsx`.
**Interfaces:** Produces `NewAccountModal({ onClose })` con selector de modo + tamaño que precarga campos editables y llama a `useAccounts().create`. `Settings` añade "restaurar preset".

- [ ] **Step 1: `NewAccountModal.jsx`**

Formulario: `name`, `drawdownMode` (toggle con `DRAWDOWN_MODES`), `sizeLabel` (select con claves de `PRESETS`). Al elegir tamaño, precargar `initialBalance/maxDrawdown/profitTarget/maxContracts` en estado local editable. Mostrar el suelo resultante en vivo con `calcFloorByMode` según el modo. Botón "Crear cuenta" → `useAccounts().create({...})` → `activate(nuevaId)` → cerrar.

```jsx
import { useState } from 'react'
import { Section, Field, Toggle, NoteBox } from './ui'
import { PRESETS, DRAWDOWN_MODES } from '../data/apexPresets'
import { useAccounts } from '../store/useAccounts'
import { calcFloorByMode, fmtUSD } from '../utils/calculations'

export default function NewAccountModal({ onClose }) {
  const create = useAccounts((s) => s.create)
  const activate = useAccounts((s) => s.activate)
  const [name, setName] = useState('')
  const [mode, setMode] = useState('intraday')
  const [size, setSize] = useState('50K')
  const [vals, setVals] = useState(PRESETS['50K'])
  const [busy, setBusy] = useState(false)
  const onSize = (s) => { setSize(s); setVals(PRESETS[s]) }
  const floor = calcFloorByMode({ mode, peakBalance: vals.initialBalance, currentBalance: vals.initialBalance, initialBalance: vals.initialBalance, maxDrawdown: vals.maxDrawdown, dailyCloses: [] })
  const submit = async () => {
    setBusy(true)
    try {
      const acc = await create({ name: name || `Mi ${size} ${mode}`, drawdownMode: mode, sizeLabel: size, ...vals })
      await activate(acc.id); onClose()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md">
        <Section title="Nueva cuenta" right={<button onClick={onClose} className="text-muted hover:text-loss">✕</button>}>
          <div className="space-y-4">
            <Field label="Nombre"><input className="input" placeholder={`Mi ${size} ${mode}`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Modo de drawdown">
              <Toggle options={DRAWDOWN_MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} size="sm" />
              <p className="mt-1 text-[11px] text-muted">{DRAWDOWN_MODES.find((m) => m.value === mode).hint}</p>
            </Field>
            <Field label="Tamaño (preset)">
              <select className="input" value={size} onChange={(e) => onSize(e.target.value)}>
                {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {[['initialBalance', 'Balance inicial'], ['maxDrawdown', 'Drawdown máx.'], ['profitTarget', 'Objetivo'], ['maxContracts', 'Contratos máx.']].map(([k, l]) => (
                <Field key={k} label={l}><input type="number" className="input tnum" value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }))} /></Field>
              ))}
            </div>
            <NoteBox tone="blue">Suelo inicial con este modo: <b>{fmtUSD(floor)}</b>. Todo es editable ahora y después en Configuración.</NoteBox>
            <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? '...' : 'Crear cuenta'}</button>
          </div>
        </Section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `Settings.jsx` — "restaurar preset"**

Añadir botón que llama a `resetPreset(account.id)` y aplica los valores devueltos con `updateSettings(preset)`. Mostrar el `drawdownMode` y `sizeLabel` (editable el modo con `Toggle`, el resto de campos ya editables vía `updateSettings`).

- [ ] **Step 3: Build + humo multi-cuenta**

`web/test/accounts.smoke.mjs`: registra, abre el selector, crea una cuenta EOD 100K, verifica que el dashboard muestra el nuevo suelo y que el selector lista 2 cuentas.
```bash
cd web && npm run build
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose up -d --build && sleep 10
cd web && node test/accounts.smoke.mjs
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose down
```
Expected: crea y cambia de cuenta sin error.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/NewAccountModal.jsx web/src/components/Settings.jsx web/test/accounts.smoke.mjs
git commit -m "feat(web): alta de cuenta con presets editables + restaurar preset"
```

---

# FASE 4 — Importación de CSV (por cuenta)

**Entregable:** parser, reconstrucción round-trip, dedupe por cuenta, preview/commit con `?accountId`, historial/undo y pantalla Importar. Validado con `orders.csv` (57 trades, −112 $).

### Task 4.1: Fixture + mapa de instrumentos del servidor

**Files:** Create `server/test/fixtures/orders.csv`, `server/src/import/instruments.js`.

- [ ] **Step 1: Copiar el fixture**

```bash
mkdir -p server/test/fixtures
cp "/Users/pomo/Documents/MIO/Tradeando/Plan para legacy/orders.csv" server/test/fixtures/orders.csv
wc -l server/test/fixtures/orders.csv
```
Expected: 115 líneas.

- [ ] **Step 2: `server/src/import/instruments.js`**

```js
export const INSTRUMENTS = {
  MNQ: { pointValue: 2, tickValue: 0.5, ticksPerPt: 4 },
  NQ: { pointValue: 20, tickValue: 5.0, ticksPerPt: 4 },
  MES: { pointValue: 5, tickValue: 1.25, ticksPerPt: 4 },
  ES: { pointValue: 50, tickValue: 12.5, ticksPerPt: 4 },
  M2K: { pointValue: 5, tickValue: 1.25, ticksPerPt: 4 },
  MYM: { pointValue: 0.5, tickValue: 0.5, ticksPerPt: 1 },
  MGC: { pointValue: 1, tickValue: 1.0, ticksPerPt: 1 },
  MCL: { pointValue: 1, tickValue: 1.0, ticksPerPt: 1 },
}
export function symbolToInstrument(symbol) {
  if (!symbol) return null
  let s = symbol.includes('.') ? symbol.split('.').pop() : symbol
  s = s.replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, '')
  return INSTRUMENTS[s] ? s : INSTRUMENTS[symbol] ? symbol : s || null
}
```

- [ ] **Step 3: Commit**

```bash
git add server/test/fixtures/orders.csv server/src/import/instruments.js
git commit -m "feat(server): fixture orders.csv y mapa símbolo→instrumento"
```

### Task 4.2: Parser de fills

**Files:** Create `server/src/import/parseOrders.js`; Test `server/test/parseOrders.test.js`.
**Interfaces:** Produces `parseOrders(csvText) -> { fills, errors }`, `Fill = { orderId, symbol, instrument, time: Date, qty, price, points, profit }`.

- [ ] **Step 1: Test `server/test/parseOrders.test.js`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseOrders } from '../src/import/parseOrders.js'
const dir = dirname(fileURLToPath(import.meta.url))
const csv = await readFile(join(dir, 'fixtures/orders.csv'), 'utf8')

test('parsea 114 fills', () => { const { fills, errors } = parseOrders(csv); assert.equal(errors.length, 0); assert.equal(fills.length, 114) })
test('normaliza CM.MNQU6 a MNQ', () => { assert.equal(parseOrders(csv).fills[0].instrument, 'MNQ') })
test('qty conserva signo', () => { const { fills } = parseOrders(csv); assert.ok(fills.some((f) => f.qty < 0) && fills.some((f) => f.qty > 0)) })
test('cabecera inválida lanza', () => { assert.throws(() => parseOrders('foo,bar\n1,2'), /cabecera|columna/i) })
```

- [ ] **Step 2: Ejecutar y ver fallo** — Run: `cd server && node --test test/parseOrders.test.js`. Expected: FAIL.

- [ ] **Step 3: `server/src/import/parseOrders.js`**

```js
import { parse } from 'csv-parse/sync'
import { symbolToInstrument } from './instruments.js'
const EXPECTED = ['name', 'order_id', 'symbol', 'mov_time', 'mov_type', 'exec_qty', 'price_done', 'points', 'profit', 'created_on']
const numOrNull = (v) => { if (v == null || String(v).trim() === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
export function parseOrders(csvText) {
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true })
  if (!records.length) throw new Error('El CSV no tiene filas')
  const cols = Object.keys(records[0])
  for (const c of EXPECTED) if (!cols.includes(c)) throw new Error(`Cabecera inesperada: falta la columna "${c}"`)
  const errors = [], fills = []
  for (const [i, r] of records.entries()) {
    const qty = numOrNull(r.exec_qty), price = numOrNull(r.price_done)
    if (qty === null || price === null) { errors.push(`Fila ${i + 2}: exec_qty/price_done no numéricos`); continue }
    const instrument = symbolToInstrument(r.symbol)
    if (!instrument) errors.push(`Fila ${i + 2}: símbolo desconocido "${r.symbol}"`)
    fills.push({ orderId: r.order_id, symbol: r.symbol, instrument, time: new Date(r.mov_time), qty, price, points: numOrNull(r.points), profit: numOrNull(r.profit) })
  }
  return { fills, errors }
}
```

- [ ] **Step 4: Ejecutar y ver pasar** — Run: `cd server && node --test test/parseOrders.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/import/parseOrders.js server/test/parseOrders.test.js
git commit -m "feat(server): parser de fills con validación de cabecera"
```

### Task 4.3: Reconstrucción round-trip + dedupe

**Files:** Create `server/src/import/buildTrades.js`; Test `server/test/buildTrades.test.js`.
**Interfaces:** Produces `buildTrades(fills) -> Trade[]`, `Trade = { externalId, date, time, instrument, direction, contracts, entry, exit, points, pnl, result }`.

- [ ] **Step 1: Test `server/test/buildTrades.test.js`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseOrders } from '../src/import/parseOrders.js'
import { buildTrades } from '../src/import/buildTrades.js'
const dir = dirname(fileURLToPath(import.meta.url))
const csv = await readFile(join(dir, 'fixtures/orders.csv'), 'utf8')

test('reconstruye 57 trades', () => { assert.equal(buildTrades(parseOrders(csv).fills).length, 57) })
test('P&L neto -112.00', () => { const n = buildTrades(parseOrders(csv).fills).reduce((a, t) => a + t.pnl, 0); assert.equal(Math.round(n * 100) / 100, -112) })
test('campos coherentes', () => { for (const t of buildTrades(parseOrders(csv).fills)) { assert.ok(['LONG', 'SHORT'].includes(t.direction)); assert.ok(t.contracts >= 1); assert.ok(['WIN', 'LOSS', 'BE'].includes(t.result)); assert.ok(t.externalId) } })
test('externalId determinista', () => { const a = buildTrades(parseOrders(csv).fills).map((t) => t.externalId); const b = buildTrades(parseOrders(csv).fills).map((t) => t.externalId); assert.deepEqual(a, b) })
```

- [ ] **Step 2: Ejecutar y ver fallo** — Run: `cd server && node --test test/buildTrades.test.js`. Expected: FAIL.

- [ ] **Step 3: `server/src/import/buildTrades.js`**

```js
import crypto from 'node:crypto'
function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}
function finalizeCycle(cycle) {
  const openSide = cycle.openSide
  const orderIds = cycle.fills.map((f) => f.orderId).sort()
  const externalId = crypto.createHash('sha1').update(orderIds.join('|')).digest('hex')
  const opens = cycle.fills.filter((f) => Math.sign(f.qty) === openSide)
  const closes = cycle.fills.filter((f) => Math.sign(f.qty) === -openSide)
  const wsum = (arr) => arr.reduce((a, f) => a + f.price * Math.abs(f.qty), 0)
  const qsum = (arr) => arr.reduce((a, f) => a + Math.abs(f.qty), 0)
  const pnl = closes.reduce((a, f) => a + (f.profit || 0), 0)
  const points = closes.reduce((a, f) => a + (f.points || 0), 0)
  const { date, time } = localDate(cycle.fills[cycle.fills.length - 1].time)
  return {
    externalId, date, time, instrument: cycle.instrument,
    direction: openSide > 0 ? 'LONG' : 'SHORT', contracts: cycle.maxSize,
    entry: qsum(opens) ? Math.round((wsum(opens) / qsum(opens)) * 100) / 100 : null,
    exit: qsum(closes) ? Math.round((wsum(closes) / qsum(closes)) * 100) / 100 : null,
    points: Math.round(points * 100) / 100, pnl: Math.round(pnl * 100) / 100,
    result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BE',
  }
}
export function buildTrades(fills) {
  const bySymbol = new Map()
  for (const f of fills) { if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, []); bySymbol.get(f.symbol).push(f) }
  const trades = []
  for (const [, list] of bySymbol) {
    list.sort((a, b) => a.time - b.time)
    let cycle = null, pos = 0
    for (const f of list) {
      if (pos === 0) cycle = { instrument: f.instrument, fills: [], openSide: Math.sign(f.qty), maxSize: 0 }
      cycle.fills.push(f); pos += f.qty; cycle.maxSize = Math.max(cycle.maxSize, Math.abs(pos))
      if (pos === 0) { trades.push(finalizeCycle(cycle)); cycle = null }
    }
  }
  trades.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return trades
}
```

- [ ] **Step 4: Ejecutar y ver pasar** — Run: `cd server && node --test test/buildTrades.test.js`. Expected: PASS. **Si no da 57 / −112, revisar el agrupado antes de seguir.**

- [ ] **Step 5: Commit**

```bash
git add server/src/import/buildTrades.js server/test/buildTrades.test.js
git commit -m "feat(server): reconstrucción round-trip con externalId determinista"
```

### Task 4.4: Rutas de importación por cuenta

**Files:** Create `server/src/migrations/0005_import_staging.sql`, `server/src/routes/import.js`; Modify `server/src/app.js`; Test `server/test/import.test.js`.
**Interfaces:** Produces `POST /import/preview?accountId`, `POST /import/commit?accountId`, `GET /import/batches?accountId`, `DELETE /import/batches/:id`.

- [ ] **Step 1: `0005_import_staging.sql`**

```sql
CREATE TABLE import_staging (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Test `server/test/import.test.js`**

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { setupTestDb, makeApp, closeAll } from './helpers.js'
import { query } from '../src/db.js'
const dir = dirname(fileURLToPath(import.meta.url))
const csv = await readFile(join(dir, 'fixtures/orders.csv'), 'utf8')
let app, token, accountId
before(async () => { await setupTestDb(); app = makeApp(); await app.ready() })
after(async () => { await app.close(); await closeAll() })
beforeEach(async () => {
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
  token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } })).json().accessToken
  accountId = (await app.inject({ method: 'GET', url: '/api/state', headers: { authorization: `Bearer ${token}` } })).json().account.id
})
const auth = () => ({ authorization: `Bearer ${token}` })
function mp(csvText) {
  const boundary = '----apextest'
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="orders.csv"\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${boundary}--\r\n` }
}

test('preview: 57 trades, -112, 57 nuevos', async () => {
  const m = mp(csv)
  const s = (await app.inject({ method: 'POST', url: `/api/import/preview?accountId=${accountId}`, headers: { ...auth(), ...m.headers }, payload: m.body })).json().summary
  assert.equal(s.trades, 57); assert.equal(Math.round(s.netPnl * 100) / 100, -112); assert.equal(s.inserted, 57); assert.equal(s.duplicates, 0)
})
test('commit inserta 57 y reimportar da 0 nuevos', async () => {
  const m = mp(csv)
  await app.inject({ method: 'POST', url: `/api/import/preview?accountId=${accountId}`, headers: { ...auth(), ...m.headers }, payload: m.body })
  const c = await app.inject({ method: 'POST', url: `/api/import/commit?accountId=${accountId}`, headers: auth(), payload: { filename: 'orders.csv' } })
  assert.equal(c.json().insertedCount, 57)
  assert.equal((await app.inject({ method: 'GET', url: `/api/trades?accountId=${accountId}`, headers: auth() })).json().trades.length, 57)
  await app.inject({ method: 'POST', url: `/api/import/preview?accountId=${accountId}`, headers: { ...auth(), ...m.headers }, payload: m.body })
  const c2 = await app.inject({ method: 'POST', url: `/api/import/commit?accountId=${accountId}`, headers: auth(), payload: { filename: 'orders.csv' } })
  assert.equal(c2.json().insertedCount, 0); assert.equal(c2.json().duplicateCount, 57)
})
test('undo borra los trades del lote', async () => {
  const m = mp(csv)
  await app.inject({ method: 'POST', url: `/api/import/preview?accountId=${accountId}`, headers: { ...auth(), ...m.headers }, payload: m.body })
  const batchId = (await app.inject({ method: 'POST', url: `/api/import/commit?accountId=${accountId}`, headers: auth(), payload: { filename: 'orders.csv' } })).json().batch.id
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/import/batches/${batchId}`, headers: auth() })).statusCode, 204)
  assert.equal((await app.inject({ method: 'GET', url: `/api/trades?accountId=${accountId}`, headers: auth() })).json().trades.length, 0)
})
```

- [ ] **Step 3: Ejecutar y ver fallo**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/import.test.js
```
Expected: FAIL.

- [ ] **Step 4: `server/src/routes/import.js`**

```js
import { query, getPool } from '../db.js'
import { resolveAccount } from '../accounts/guard.js'
import { parseOrders } from '../import/parseOrders.js'
import { buildTrades } from '../import/buildTrades.js'

async function need(req, reply) {
  const acc = await resolveAccount(req.userId, req.query.accountId)
  if (!acc) { reply.code(404).send({ error: 'no_account', message: 'Cuenta no encontrada' }); return null }
  return acc
}
async function existing(accountId, ids) {
  if (!ids.length) return new Set()
  const r = await query('SELECT external_id FROM trades WHERE account_id=$1 AND external_id = ANY($2)', [accountId, ids])
  return new Set(r.rows.map((x) => x.external_id))
}

export async function importRoutes(app) {
  app.post('/import/preview', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: 'no_file', message: 'Sube un archivo CSV' })
    const buf = await file.toBuffer()
    let trades, fillCount
    try { const { fills } = parseOrders(buf.toString('utf8')); trades = buildTrades(fills); fillCount = fills.length }
    catch (e) { return reply.code(400).send({ error: 'parse_error', message: e.message }) }
    if (!trades.length) return reply.code(400).send({ error: 'no_trades', message: 'Sin trades cerrados en el CSV' })
    const ids = trades.map((t) => t.externalId)
    const exists = await existing(acc.id, ids)
    const proposed = trades.map((t) => ({ ...t, duplicate: exists.has(t.externalId) }))
    const inserted = proposed.filter((t) => !t.duplicate).length
    const netPnl = trades.reduce((a, t) => a + t.pnl, 0)
    const dates = trades.map((t) => t.date).sort()
    await query(
      `INSERT INTO import_staging(account_id,user_id,filename,payload) VALUES ($1,$2,$3,$4)
       ON CONFLICT (account_id) DO UPDATE SET user_id=EXCLUDED.user_id, filename=EXCLUDED.filename, payload=EXCLUDED.payload, created_at=now()`,
      [acc.id, req.userId, file.filename, JSON.stringify(trades)],
    )
    reply.send({ summary: { fills: fillCount, trades: trades.length, inserted, duplicates: trades.length - inserted, netPnl: Math.round(netPnl * 100) / 100, dateFrom: dates[0], dateTo: dates[dates.length - 1] }, proposed })
  })

  app.post('/import/commit', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const { filename = null, rebuildDailyRecords = false, newBalance = null } = req.body || {}
    const st = await query('SELECT payload, filename FROM import_staging WHERE account_id=$1', [acc.id])
    if (!st.rowCount) return reply.code(400).send({ error: 'no_preview', message: 'Haz primero un preview' })
    const trades = st.rows[0].payload
    const ids = trades.map((t) => t.externalId)
    const exists = await existing(acc.id, ids)
    const fresh = trades.filter((t) => !exists.has(t.externalId))
    const netPnl = trades.reduce((a, t) => a + t.pnl, 0)
    const dates = trades.map((t) => t.date).sort()
    const client = await getPool().connect()
    let batch
    try {
      await client.query('BEGIN')
      batch = (await client.query(
        `INSERT INTO import_batches(account_id,user_id,filename,row_count,trade_count,inserted_count,duplicate_count,net_pnl,date_from,date_to)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [acc.id, req.userId, filename || st.rows[0].filename, trades.length, fresh.length, trades.length - fresh.length, netPnl, dates[0], dates[dates.length - 1]],
      )).rows[0]
      for (const t of fresh) {
        await client.query(
          `INSERT INTO trades(account_id,user_id,date,time,instrument,direction,contracts,result,pnl,points,strategy,notes,source,external_id,import_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'','', 'import',$11,$12)
           ON CONFLICT (account_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
          [acc.id, req.userId, t.date, t.time, t.instrument, t.direction, t.contracts, t.result, t.pnl, t.points, t.externalId, batch.id],
        )
      }
      if (rebuildDailyRecords) {
        const byDay = new Map()
        for (const t of trades) byDay.set(t.date, (byDay.get(t.date) || 0) + t.pnl)
        for (const [date, pnl] of byDay) {
          await client.query(
            `INSERT INTO daily_records(account_id,user_id,date,open,close,note) VALUES ($1,$2,$3,NULL,$4,$5)
             ON CONFLICT (account_id,date) DO UPDATE SET close=EXCLUDED.close, note=EXCLUDED.note`,
            [acc.id, req.userId, date, Math.round(pnl * 100) / 100, `P&L importado ${Math.round(pnl * 100) / 100}`],
          )
        }
      }
      if (newBalance != null) {
        await client.query('UPDATE accounts SET current_balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1', [acc.id, newBalance])
      }
      await client.query('DELETE FROM import_staging WHERE account_id=$1', [acc.id])
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    reply.send({ batch, insertedCount: fresh.length, duplicateCount: trades.length - fresh.length })
  })

  app.get('/import/batches', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    return { batches: (await query('SELECT * FROM import_batches WHERE account_id=$1 ORDER BY created_at DESC', [acc.id])).rows }
  })

  app.delete('/import/batches/:id', async (req, reply) => {
    const own = await query('SELECT 1 FROM import_batches WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!own.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Lote no encontrado' })
    await query('DELETE FROM trades WHERE import_batch_id=$1 AND user_id=$2', [req.params.id, req.userId])
    await query('DELETE FROM import_batches WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    reply.code(204).send()
  })
}
```

- [ ] **Step 5: Registrar multipart + rutas en `app.js`** — `import multipart from '@fastify/multipart'`; `app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })` antes del bloque `/api`; `await importRoutes(api)` dentro; import de `importRoutes`.

- [ ] **Step 6: Ejecutar suite completa** — Run: `cd server && node --test test/`. Expected: PASS. Parar Postgres.

- [ ] **Step 7: Commit**

```bash
git add server/src/migrations/0005_import_staging.sql server/src/routes/import.js server/src/app.js server/test/import.test.js
git commit -m "feat(server): importación CSV por cuenta con dedupe, batches y undo"
```

### Task 4.5: Frontend — pantalla Importar

**Files:** Create `web/src/components/ImportTrades.jsx`, `web/src/api/importApi.js`; Modify `web/src/components/Navbar.jsx`, `web/src/App.jsx`.
**Interfaces:** `importApi.preview(accountId, file)`, `commit(accountId, opts)`, `listBatches(accountId)`, `undoBatch(id)`.

- [ ] **Step 1: `web/src/api/importApi.js`**

```js
import { API_BASE, getAccessToken, apiFetch } from './client'
export async function preview(accountId, file) {
  const fd = new FormData(); fd.append('file', file)
  const res = await fetch(`${API_BASE}/api/import/preview?accountId=${accountId}`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${getAccessToken()}` }, body: fd })
  if (!res.ok) { let p = {}; try { p = await res.json() } catch { /* */ } throw new Error(p.message || `HTTP ${res.status}`) }
  return res.json()
}
export const commit = (accountId, opts) => apiFetch(`/api/import/commit?accountId=${accountId}`, { method: 'POST', body: opts })
export const listBatches = (accountId) => apiFetch(`/api/import/batches?accountId=${accountId}`)
export const undoBatch = (id) => apiFetch(`/api/import/batches/${id}`, { method: 'DELETE' })
```

- [ ] **Step 2: `web/src/components/ImportTrades.jsx`** — dropzone → `preview(activeAccountId, file)` → totales + tabla de propuestos (marca duplicados) + casilla "reconstruir suelo" → `commit(activeAccountId, {...})` → `hydrate(activeAccountId)`; sección de historial con "Deshacer". (Estructura idéntica a la de un componente de sección estándar; usa `useAccounts().activeId` para el `accountId`.)

- [ ] **Step 3: Pestaña + ruta** — en `Navbar.jsx` añadir `{ id: 'import', label: 'Importar', icon: '⇪', short: 'Import' }`; en `App.jsx` `{screen === 'import' && <ImportTrades />}`.

- [ ] **Step 4: Build + humo importación**

`web/test/import.smoke.mjs`: registra, va a Importar, `setInputFiles` con `server/test/fixtures/orders.csv`, espera "57", confirma, verifica 57 trades en el diario.
```bash
cd web && npm run build
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose up -d --build && sleep 10
cd web && node test/import.smoke.mjs
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose down
```
Expected: importa 57 y confirma.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ImportTrades.jsx web/src/api/importApi.js web/src/components/Navbar.jsx web/src/App.jsx web/test/import.smoke.mjs
git commit -m "feat(web): pantalla de importación de CSV por cuenta"
```

---

# FASE 5 — Producción en Dokploy

**Entregable:** imágenes de producción, compose de referencia y guía de despliegue.

### Task 5.1: Imagen de producción del frontend (Nginx)

**Files:** Create `web/Dockerfile`, `web/nginx.conf`, `docker-compose.prod.yml`.

- [ ] **Step 1: `web/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

- [ ] **Step 2: `web/Dockerfile`**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: `docker-compose.prod.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes: ['pgdata:/var/lib/postgresql/data']
    restart: unless-stopped
  server:
    build: ./server
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      PORT: 3001
      WEB_ORIGIN: ${WEB_ORIGIN}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      NODE_ENV: production
    depends_on: ['db']
    restart: unless-stopped
  web:
    build:
      context: ./web
      args:
        VITE_API_URL: ${WEB_API_URL}
    restart: unless-stopped
volumes:
  pgdata:
```

- [ ] **Step 4: Probar build web de prod**

```bash
docker build -t apex-web-prod --build-arg VITE_API_URL=http://localhost:3001 ./web
docker run --rm -d -p 8080:80 --name apex-web-prod apex-web-prod
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
docker stop apex-web-prod
```
Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add web/Dockerfile web/nginx.conf docker-compose.prod.yml
git commit -m "feat: imagen web de producción (Nginx) + compose prod"
```

### Task 5.2: Guía de despliegue + hardening final

**Files:** Create `docs/DEPLOY.md`; Modify `README.md`.

- [ ] **Step 1: `docs/DEPLOY.md`**

Contenido: desplegar en Dokploy los 3 servicios o `docker-compose.prod.yml`; variables obligatorias (`POSTGRES_*`, `JWT_*` con `openssl rand -hex 32`, `WEB_ORIGIN`=dominio front, `WEB_API_URL`=dominio API); TLS/Traefik los pone Dokploy; el server migra al arrancar; **backup de Postgres** programado; en prod `NODE_ENV=production` activa cookie `Secure` (requiere HTTPS); checklist de seguridad (secretos únicos, CORS al dominio real, rate-limit, deps actualizadas).

- [ ] **Step 2: `README.md`** — monorepo (`web/`+`server/`), arranque dev (`cp .env.example .env && docker compose up`), URLs (:5173 / :3001), tests server (`cd server && node --test test/`), enlaces a spec/plan y `docs/DEPLOY.md`.

- [ ] **Step 3: Verificación final**

```bash
docker run --rm -d --name apex-pg-test -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex -p 5432:5432 postgres:16 && sleep 3
cd server && node --test test/
docker stop apex-pg-test
cd /Users/pomo/Documents/App/trade/apex-dashboard && docker compose up -d --build && sleep 10 && curl -s http://localhost:3001/health && docker compose down
```
Expected: suite en verde y `/health` OK.

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOY.md README.md
git commit -m "docs: guía de despliegue en Dokploy y README del monorepo"
```

---

## Self-Review (cobertura del spec v2)

- **§1bis modos + presets** → `presets.js` (1.2), `calcFloorByMode` (2.1), preset picker (3.3). ✅
- **§3 modelo v2** (users+active_account_id, accounts, trades/daily/import por account) → migraciones 0002-0004 (1.1), staging 0005 (4.4). ✅
- **§4 auth** (register crea cuenta activa, argon2, rate-limit/CORS/helmet, refresh rotación) → 1.3, 1.4. ✅
- **§5 API** (accounts CRUD+activate+reset-preset; state/trades/daily/import con `?accountId`) → 2.2, 2.3, 2.4, 3.1, 4.4. ✅
- **§6 import** (parser, round-trip, dedupe por cuenta, preview/commit, undo) → 4.2, 4.3, 4.4, 4.5. ✅
- **§7 frontend** (cliente API, floor por modo, selector de cuenta, alta con presets, settings por cuenta, migración local) → 1.5, 2.1, 2.5, 2.6, 3.2, 3.3, 4.5. ✅
- **§8 fases** → estructura del plan (0–5). ✅
- **§9 testing** (parser/buildTrades con fixture, auth, CRUD, aislamiento usuario+cuenta, calcFloor 3 modos, humos) → 1.3-1.4, 2.1, 2.3, 2.4, 3.1, 4.2-4.4, humos. ✅
- **§10 fuera de alcance** respetado. ✅

**Consistencia de tipos:** `rowToAccount` (guard.js) usado por state/accounts; `resolveAccount(userId, accountId)` compartido por state/trades/daily/import; `calcFloorByMode({mode,peakBalance,currentBalance,initialBalance,maxDrawdown,dailyCloses})` idéntico en test y uso; `patchAccount(id,patch)` definido en endpoints.js (2.5) y consumido por store/migrateLocal/settings; `PRESETS` con las mismas 9 claves en server y web. Sin placeholders.
