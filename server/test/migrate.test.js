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

test('las tablas existen tras migrar', async () => {
  await runMigrations()
  const r = await query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)",
    [['users', 'accounts', 'trades', 'daily_records', 'import_batches', 'refresh_tokens']],
  )
  assert.equal(r.rowCount, 6)
})
