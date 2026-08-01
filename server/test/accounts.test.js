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
test('patch con drawdownMode inválido devuelve 400', async () => {
  const acc = (await app.inject({ method: 'GET', url: '/api/accounts', headers: auth() })).json().accounts[0]
  const r = await app.inject({ method: 'PATCH', url: `/api/accounts/${acc.id}`, headers: auth(), payload: { drawdownMode: 'bogus' } })
  assert.equal(r.statusCode, 400)
  assert.equal(r.json().error, 'bad_mode')
})
