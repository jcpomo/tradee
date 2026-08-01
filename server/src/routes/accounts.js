import { query } from '../db.js'
import { rowToAccount } from '../accounts/guard.js'

// camelCase (body) -> columna real. Fase 3 amplía este mapa y el resto del CRUD.
const EDITABLE = {
  name: 'name', drawdownMode: 'drawdown_mode', sizeLabel: 'size_label',
  initialBalance: 'initial_balance', maxDrawdown: 'max_drawdown', profitTarget: 'profit_target',
  maxContracts: 'max_contracts', evalDays: 'eval_days', startDate: 'start_date',
  currentBalance: 'current_balance', peakBalance: 'peak_balance',
  riskPerTrade: 'risk_per_trade', dailyStopLimit: 'daily_stop_limit', minRR: 'min_rr',
  maxTradesPerDay: 'max_trades_per_day', defaultContracts: 'default_contracts',
  defaultInstrument: 'default_instrument', accountKind: 'account_kind',
}

export async function accountsRoutes(app) {
  app.patch('/accounts/:id', async (req, reply) => {
    const entries = Object.keys(EDITABLE).filter((k) => k in (req.body || {}))
    if (!entries.length) return reply.code(400).send({ error: 'empty', message: 'Nada que actualizar' })
    const sets = entries.map((k, i) => `${EDITABLE[k]}=$${i + 3}`).join(', ')
    const vals = entries.map((k) => req.body[k])
    // propiedad validada por user_id directamente sobre accounts
    const r = await query(
      `UPDATE accounts SET ${sets} WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.userId, ...vals],
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Cuenta no encontrada' })
    reply.send({ account: rowToAccount(r.rows[0]) })
  })
}
