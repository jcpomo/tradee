import crypto from 'node:crypto'
import { INSTRUMENTS } from './instruments.js'

const r2 = (v) => Math.round(v * 100) / 100
function utcDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
           time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}
function finalize(seg, trades) {
  const openQty = seg.opens.reduce((a, o) => a + o.qty, 0)
  const closeQty = seg.closes.reduce((a, c) => a + c.qty, 0)
  const entry = openQty ? seg.opens.reduce((a, o) => a + o.price * o.qty, 0) / openQty : null
  const exit = closeQty ? seg.closes.reduce((a, c) => a + c.price * c.qty, 0) / closeQty : null
  const contracts = seg.maxSize
  const pv = INSTRUMENTS[seg.instrument]?.pointValue ?? 0
  const hasProfit = seg.closeProfits.some((p) => p !== null)
  let pnl, points
  if (hasProfit) {
    pnl = r2(seg.closeProfits.reduce((a, p) => a + (p || 0), 0))
    points = r2(seg.closePoints.reduce((a, p) => a + (p || 0), 0))
  } else {
    const gross = (exit - entry) * seg.side * pv * closeQty
    pnl = r2(gross - seg.commission)
    points = r2((exit - entry) * seg.side)
  }
  const externalId = crypto.createHash('sha1').update([...seg.idList].sort().join('|')).digest('hex')
  const { date, time } = utcDate(seg.lastTime)
  trades.push({ externalId, date, time, instrument: seg.instrument,
    direction: seg.side > 0 ? 'LONG' : 'SHORT', contracts,
    entry: entry == null ? null : r2(entry), exit: exit == null ? null : r2(exit),
    points, pnl, result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BE', commission: r2(seg.commission) })
}
export function buildTrades(fills) {
  const bySymbol = new Map()
  for (const f of fills) { if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, []); bySymbol.get(f.symbol).push(f) }
  const trades = []
  const start = (side, instrument) => ({ side, instrument, opens: [], closes: [], commission: 0, idList: [], maxSize: 0, closeProfits: [], closePoints: [], lastTime: null })
  for (const [, list] of bySymbol) {
    list.sort((a, b) => a.time - b.time)
    let pos = 0, seg = null
    for (const f of list) {
      let remaining = Math.abs(f.qty)
      const dir = Math.sign(f.qty)
      const commPerContract = remaining ? (f.commission || 0) / remaining : 0
      let addedTo = null
      while (remaining > 0) {
        if (pos === 0) seg = start(dir, f.instrument)
        seg.lastTime = f.time
        if (addedTo !== seg) { seg.idList.push(f.orderId); addedTo = seg }
        if (pos === 0 || dir === seg.side) {
          const take = remaining
          seg.opens.push({ price: f.price, qty: take })
          seg.commission += commPerContract * take
          pos += dir * take; remaining = 0
          seg.maxSize = Math.max(seg.maxSize, Math.abs(pos))
        } else {
          const take = Math.min(remaining, Math.abs(pos))
          seg.closes.push({ price: f.price, qty: take })
          seg.commission += commPerContract * take
          if (f.profit !== null && f.profit !== undefined) {
            seg.closeProfits.push(f.profit * (take / Math.abs(f.qty)))
            seg.closePoints.push((f.points || 0) * (take / Math.abs(f.qty)))
          } else { seg.closeProfits.push(null); seg.closePoints.push(null) }
          pos += dir * take; remaining -= take
          seg.maxSize = Math.max(seg.maxSize, Math.abs(pos))
          if (pos === 0) { finalize(seg, trades); seg = null }
        }
      }
    }
    // posición abierta al final del fichero: se ignora (no es un round-trip cerrado)
  }
  trades.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return trades
}
