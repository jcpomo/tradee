import { query } from '../db.js'
import { resolveAccount } from '../accounts/guard.js'

export function rowToTrade(r) {
  return {
    id: r.id, accountId: r.account_id,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
    time: r.time, instrument: r.instrument, direction: r.direction, contracts: r.contracts,
    result: r.result, pnl: Number(r.pnl), points: r.points == null ? null : Number(r.points),
    strategy: r.strategy || '', notes: r.notes || '', source: r.source, importBatchId: r.import_batch_id,
  }
}
const tradeBody = {
  type: 'object',
  properties: {
    date: { type: 'string' }, time: { type: 'string' }, instrument: { type: 'string' },
    direction: { type: 'string', enum: ['LONG', 'SHORT'] }, contracts: { type: 'integer', minimum: 1, maximum: 40 },
    result: { type: 'string', enum: ['WIN', 'LOSS', 'BE'] }, pnl: { type: 'number' },
    points: { type: ['number', 'null'] }, strategy: { type: 'string' }, notes: { type: 'string' },
  },
}
// helper: exige cuenta válida; devuelve fila o manda 404
async function need(req, reply) {
  const accountId = req.query.accountId
  if (!accountId) { reply.code(404).send({ error: 'no_account', message: 'Falta accountId' }); return null }
  const acc = await resolveAccount(req.userId, accountId)
  if (!acc) { reply.code(404).send({ error: 'no_account', message: 'Cuenta no encontrada' }); return null }
  return acc
}

export async function tradesRoutes(app) {
  app.get('/trades', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const { from, to } = req.query
    const params = [acc.id]; const clauses = ['account_id=$1']
    if (from) { params.push(from); clauses.push(`date >= $${params.length}`) }
    if (to) { params.push(to); clauses.push(`date <= $${params.length}`) }
    const r = await query(`SELECT * FROM trades WHERE ${clauses.join(' AND ')} ORDER BY date, time`, params)
    return { trades: r.rows.map(rowToTrade) }
  })

  app.post('/trades', { schema: { body: { ...tradeBody, required: ['date', 'instrument', 'direction', 'result'] } } }, async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const t = req.body
    const r = await query(
      `INSERT INTO trades(account_id,user_id,date,time,instrument,direction,contracts,result,pnl,points,strategy,notes,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual') RETURNING *`,
      [acc.id, req.userId, t.date, t.time || null, t.instrument, t.direction, t.contracts || 1, t.result, t.pnl || 0, t.points ?? null, t.strategy || '', t.notes || ''],
    )
    reply.code(201).send({ trade: rowToTrade(r.rows[0]) })
  })

  app.patch('/trades/:id', { schema: { body: tradeBody } }, async (req, reply) => {
    const fields = ['date', 'time', 'instrument', 'direction', 'contracts', 'result', 'pnl', 'points', 'strategy', 'notes']
    const entries = fields.filter((f) => f in (req.body || {}))
    if (!entries.length) return reply.code(400).send({ error: 'empty', message: 'Nada que actualizar' })
    const sets = entries.map((f, i) => `${f}=$${i + 3}`).join(', ')
    const vals = entries.map((f) => req.body[f])
    // propiedad validada por user_id directamente sobre trades
    const r = await query(
      `UPDATE trades SET ${sets} WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.userId, ...vals],
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Trade no encontrado' })
    reply.send({ trade: rowToTrade(r.rows[0]) })
  })

  app.delete('/trades/:id', async (req, reply) => {
    const r = await query('DELETE FROM trades WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Trade no encontrado' })
    reply.code(204).send()
  })

  app.get('/trades/export.csv', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const r = await query('SELECT * FROM trades WHERE account_id=$1 ORDER BY date, time', [acc.id])
    const header = ['Fecha', 'Hora', 'Instrumento', 'Direccion', 'Contratos', 'Resultado', 'PnL', 'Puntos', 'Estrategia', 'Notas']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [header.join(',')]
    for (const row of r.rows) {
      const t = rowToTrade(row)
      lines.push([t.date, t.time, t.instrument, t.direction, t.contracts, t.result, t.pnl, t.points ?? '', t.strategy, t.notes].map(esc).join(','))
    }
    reply.header('content-type', 'text/csv;charset=utf-8')
    reply.header('content-disposition', 'attachment; filename="apex-trades.csv"')
    reply.send(lines.join('\n'))
  })
}
