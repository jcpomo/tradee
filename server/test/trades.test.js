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
