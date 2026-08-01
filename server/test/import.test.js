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

test('preview: 57 trades, -101.28, 57 nuevos', async () => {
  const m = mp(csv)
  const s = (await app.inject({ method: 'POST', url: `/api/import/preview?accountId=${accountId}`, headers: { ...auth(), ...m.headers }, payload: m.body })).json().summary
  assert.equal(s.trades, 57); assert.equal(Math.round(s.netPnl * 100) / 100, -101.28); assert.equal(s.inserted, 57); assert.equal(s.duplicates, 0)
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
