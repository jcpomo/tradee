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
