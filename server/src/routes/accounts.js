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
    const body = req.body || {}
    if ('drawdownMode' in body && !DRAWDOWN_MODES.includes(body.drawdownMode)) {
      return reply.code(400).send({ error: 'bad_mode', message: 'Modo de drawdown no válido' })
    }
    const entries = Object.entries(body).filter(([k]) => EDITABLE[k])
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
