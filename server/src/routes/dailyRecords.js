import { query } from '../db.js'
import { resolveAccount } from '../accounts/guard.js'
export function rowToRecord(r) {
  return { id: r.id, accountId: r.account_id, date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date, open: r.open == null ? null : Number(r.open), close: Number(r.close), note: r.note || '' }
}
async function need(req, reply) {
  const accountId = req.query.accountId
  if (!accountId) { reply.code(404).send({ error: 'no_account', message: 'Falta accountId' }); return null }
  const acc = await resolveAccount(req.userId, accountId)
  if (!acc) { reply.code(404).send({ error: 'no_account', message: 'Cuenta no encontrada' }); return null }
  return acc
}
export async function dailyRecordsRoutes(app) {
  app.get('/daily-records', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const r = await query('SELECT * FROM daily_records WHERE account_id=$1 ORDER BY date', [acc.id])
    return { records: r.rows.map(rowToRecord) }
  })
  app.post('/daily-records', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const { date, open, close, note } = req.body || {}
    const r = await query(
      `INSERT INTO daily_records(account_id,user_id,date,open,close,note) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (account_id,date) DO UPDATE SET open=EXCLUDED.open, close=EXCLUDED.close, note=EXCLUDED.note RETURNING *`,
      [acc.id, req.userId, date, open ?? null, close, note || ''],
    )
    reply.send({ record: rowToRecord(r.rows[0]) })
  })
  app.delete('/daily-records/:id', async (req, reply) => {
    const r = await query('DELETE FROM daily_records WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Registro no encontrado' })
    reply.code(204).send()
  })
}
