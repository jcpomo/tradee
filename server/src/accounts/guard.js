import { query } from '../db.js'

export function rowToAccount(r) {
  const d = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)
  return {
    id: r.id, name: r.name, drawdownMode: r.drawdown_mode, sizeLabel: r.size_label,
    initialBalance: Number(r.initial_balance), maxDrawdown: Number(r.max_drawdown),
    profitTarget: Number(r.profit_target), maxContracts: r.max_contracts,
    evalDays: r.eval_days, startDate: d(r.start_date),
    currentBalance: Number(r.current_balance), peakBalance: Number(r.peak_balance),
    riskPerTrade: Number(r.risk_per_trade), dailyStopLimit: Number(r.daily_stop_limit),
    minRR: Number(r.min_rr), maxTradesPerDay: r.max_trades_per_day,
    defaultContracts: r.default_contracts, defaultInstrument: r.default_instrument,
    accountKind: r.account_kind,
  }
}

// Devuelve la cuenta (fila) si pertenece al usuario; si accountId es falsy, la activa.
export async function resolveAccount(userId, accountId) {
  if (accountId) {
    const r = await query('SELECT * FROM accounts WHERE id=$1 AND user_id=$2', [accountId, userId])
    return r.rows[0] || null
  }
  const r = await query(
    'SELECT a.* FROM accounts a JOIN users u ON u.active_account_id=a.id WHERE u.id=$1',
    [userId],
  )
  return r.rows[0] || null
}
