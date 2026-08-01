import argon2 from 'argon2'
import { query, getPool } from '../db.js'
import { config } from '../config.js'
import { presetFor } from '../accounts/presets.js'
import { signAccess, signRefresh, refreshCookieOpts } from './tokens.js'

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
