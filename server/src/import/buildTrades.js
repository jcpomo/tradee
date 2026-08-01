import crypto from 'node:crypto'

function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}

function finalizeCycle(cycle) {
  const openSide = cycle.openSide
  const orderIds = cycle.fills.map((f) => f.orderId).sort()
  const externalId = crypto.createHash('sha1').update(orderIds.join('|')).digest('hex')
  const opens = cycle.fills.filter((f) => Math.sign(f.qty) === openSide)
  const closes = cycle.fills.filter((f) => Math.sign(f.qty) === -openSide)
  const wsum = (arr) => arr.reduce((a, f) => a + f.price * Math.abs(f.qty), 0)
  const qsum = (arr) => arr.reduce((a, f) => a + Math.abs(f.qty), 0)
  const pnl = closes.reduce((a, f) => a + (f.profit || 0), 0)
  const points = closes.reduce((a, f) => a + (f.points || 0), 0)
  const { date, time } = localDate(cycle.fills[cycle.fills.length - 1].time)
  return {
    externalId, date, time, instrument: cycle.instrument,
    direction: openSide > 0 ? 'LONG' : 'SHORT', contracts: cycle.maxSize,
    entry: qsum(opens) ? Math.round((wsum(opens) / qsum(opens)) * 100) / 100 : null,
    exit: qsum(closes) ? Math.round((wsum(closes) / qsum(closes)) * 100) / 100 : null,
    points: Math.round(points * 100) / 100, pnl: Math.round(pnl * 100) / 100,
    result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BE',
  }
}

export function buildTrades(fills) {
  const bySymbol = new Map()
  for (const f of fills) { if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, []); bySymbol.get(f.symbol).push(f) }
  const trades = []
  for (const [, list] of bySymbol) {
    list.sort((a, b) => a.time - b.time)
    let cycle = null, pos = 0
    for (const f of list) {
      if (pos === 0) cycle = { instrument: f.instrument, fills: [], openSide: Math.sign(f.qty), maxSize: 0 }
      cycle.fills.push(f); pos += f.qty; cycle.maxSize = Math.max(cycle.maxSize, Math.abs(pos))
      if (pos === 0) { trades.push(finalizeCycle(cycle)); cycle = null }
    }
  }
  trades.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return trades
}
