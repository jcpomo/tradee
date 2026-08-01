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

test('un usuario no puede crear registro diario en la cuenta de otro', async () => {
  const a = await reg('a@b.com'); const b = await reg('c@d.com')
  // b intenta crear registro diario en la cuenta de a
  const res = await app.inject({ method: 'POST', url: `/api/daily-records?accountId=${a.acc}`, headers: { authorization: `Bearer ${b.t}` }, payload: { date: '2026-07-23', open: 50000, close: 50200 } })
  assert.equal(res.statusCode, 404)
})

test('no se ve ni se borra un registro diario de otro', async () => {
  const a = await reg('a@b.com'); const b = await reg('c@d.com')
  const c = await app.inject({ method: 'POST', url: `/api/daily-records?accountId=${a.acc}`, headers: { authorization: `Bearer ${a.t}` }, payload: { date: '2026-07-23', open: 50000, close: 50200 } })
  const id = c.json().record.id
  assert.equal((await app.inject({ method: 'GET', url: `/api/daily-records?accountId=${b.acc}`, headers: { authorization: `Bearer ${b.t}` } })).json().records.length, 0)
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/daily-records/${id}`, headers: { authorization: `Bearer ${b.t}` } })).statusCode, 404)
})
