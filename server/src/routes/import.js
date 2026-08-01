import { query, getPool } from '../db.js'
import { resolveAccount } from '../accounts/guard.js'
import { parseOrders } from '../import/parseOrders.js'
import { buildTrades } from '../import/buildTrades.js'

async function need(req, reply) {
  const accountId = req.query.accountId
  if (!accountId) { reply.code(404).send({ error: 'no_account', message: 'Falta accountId' }); return null }
  const acc = await resolveAccount(req.userId, accountId)
  if (!acc) { reply.code(404).send({ error: 'no_account', message: 'Cuenta no encontrada' }); return null }
  return acc
}
async function existing(accountId, ids) {
  if (!ids.length) return new Set()
  const r = await query('SELECT external_id FROM trades WHERE account_id=$1 AND external_id = ANY($2)', [accountId, ids])
  return new Set(r.rows.map((x) => x.external_id))
}

export async function importRoutes(app) {
  app.post('/import/preview', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: 'no_file', message: 'Sube un archivo CSV' })
    const buf = await file.toBuffer()
    let trades, fillCount
    try { const { fills } = parseOrders(buf.toString('utf8')); trades = buildTrades(fills); fillCount = fills.length }
    catch (e) { return reply.code(400).send({ error: 'parse_error', message: e.message }) }
    if (!trades.length) return reply.code(400).send({ error: 'no_trades', message: 'Sin trades cerrados en el CSV' })
    const ids = trades.map((t) => t.externalId)
    const exists = await existing(acc.id, ids)
    const proposed = trades.map((t) => ({ ...t, duplicate: exists.has(t.externalId) }))
    const inserted = proposed.filter((t) => !t.duplicate).length
    const netPnl = trades.reduce((a, t) => a + t.pnl, 0)
    const dates = trades.map((t) => t.date).sort()
    await query(
      `INSERT INTO import_staging(account_id,user_id,filename,payload) VALUES ($1,$2,$3,$4)
       ON CONFLICT (account_id) DO UPDATE SET user_id=EXCLUDED.user_id, filename=EXCLUDED.filename, payload=EXCLUDED.payload, created_at=now()`,
      [acc.id, req.userId, file.filename, JSON.stringify(trades)],
    )
    reply.send({ summary: { fills: fillCount, trades: trades.length, inserted, duplicates: trades.length - inserted, netPnl: Math.round(netPnl * 100) / 100, dateFrom: dates[0], dateTo: dates[dates.length - 1] }, proposed })
  })

  app.post('/import/commit', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    const { filename = null, rebuildDailyRecords = false, newBalance = null } = req.body || {}
    const st = await query('SELECT payload, filename FROM import_staging WHERE account_id=$1', [acc.id])
    if (!st.rowCount) return reply.code(400).send({ error: 'no_preview', message: 'Haz primero un preview' })
    const trades = st.rows[0].payload
    const ids = trades.map((t) => t.externalId)
    const exists = await existing(acc.id, ids)
    const fresh = trades.filter((t) => !exists.has(t.externalId))
    const netPnl = trades.reduce((a, t) => a + t.pnl, 0)
    const dates = trades.map((t) => t.date).sort()
    const client = await getPool().connect()
    let batch
    try {
      await client.query('BEGIN')
      batch = (await client.query(
        `INSERT INTO import_batches(account_id,user_id,filename,row_count,trade_count,inserted_count,duplicate_count,net_pnl,date_from,date_to)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [acc.id, req.userId, filename || st.rows[0].filename, trades.length, fresh.length, trades.length - fresh.length, netPnl, dates[0], dates[dates.length - 1]],
      )).rows[0]
      for (const t of fresh) {
        await client.query(
          `INSERT INTO trades(account_id,user_id,date,time,instrument,direction,contracts,result,pnl,points,strategy,notes,source,external_id,import_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'','', 'import',$11,$12)
           ON CONFLICT (account_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
          [acc.id, req.userId, t.date, t.time, t.instrument, t.direction, t.contracts, t.result, t.pnl, t.points, t.externalId, batch.id],
        )
      }
      if (rebuildDailyRecords) {
        const round2 = (v) => Math.round(v * 100) / 100
        const byDay = new Map()
        for (const t of trades) byDay.set(t.date, (byDay.get(t.date) || 0) + t.pnl)
        const sortedDates = [...byDay.keys()].sort()
        let running = Number(acc.initial_balance)
        for (const date of sortedDates) {
          const dayPnl = byDay.get(date)
          const open = round2(running)
          running += dayPnl
          const close = round2(running)
          await client.query(
            `INSERT INTO daily_records(account_id,user_id,date,open,close,note) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (account_id,date) DO UPDATE SET open=EXCLUDED.open, close=EXCLUDED.close, note=EXCLUDED.note`,
            [acc.id, req.userId, date, open, close, `P&L importado ${round2(dayPnl)}`],
          )
        }
      }
      if (newBalance != null) {
        await client.query('UPDATE accounts SET current_balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1', [acc.id, newBalance])
      }
      await client.query('DELETE FROM import_staging WHERE account_id=$1', [acc.id])
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    reply.send({ batch, insertedCount: fresh.length, duplicateCount: trades.length - fresh.length })
  })

  app.get('/import/batches', async (req, reply) => {
    const acc = await need(req, reply); if (!acc) return
    return { batches: (await query('SELECT * FROM import_batches WHERE account_id=$1 ORDER BY created_at DESC', [acc.id])).rows }
  })

  app.delete('/import/batches/:id', async (req, reply) => {
    const own = await query('SELECT 1 FROM import_batches WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!own.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Lote no encontrado' })
    await query('DELETE FROM trades WHERE import_batch_id=$1 AND user_id=$2', [req.params.id, req.userId])
    await query('DELETE FROM import_batches WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    reply.code(204).send()
  })
}
