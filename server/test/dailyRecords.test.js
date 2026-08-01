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
