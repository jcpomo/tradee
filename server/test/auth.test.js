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
