import { INSTRUMENTS, symbolToInstrument } from './instruments.js'

const FILLS_REQUIRED = ['_id', '_timestamp', 'B/S', 'Product', 'commission']

const numOrNull = (v) => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function isTradovateFills(cols) {
  return FILLS_REQUIRED.every((c) => cols.includes(c))
}

export function parseTradovateFillsRecords(records) {
  if (!records.length) throw new Error('El CSV no tiene filas')

  const errors = [], fills = []
  for (const [i, r] of records.entries()) {
    const side = String(r['B/S'] || '').trim().toLowerCase()
    const dir = side === 'buy' ? 1 : side === 'sell' ? -1 : null
    if (dir === null) {
      errors.push(`Fila ${i + 2}: B/S desconocido "${r['B/S']}"`)
      continue
    }
    const magnitude = numOrNull(r.Quantity) ?? numOrNull(r._qty)
    const price = numOrNull(r.Price) ?? numOrNull(r._price)
    if (magnitude === null || price === null) {
      errors.push(`Fila ${i + 2}: Quantity/Price no numéricos`)
      continue
    }
    const product = String(r.Product || '').trim()
    const instrument = INSTRUMENTS[product] ? product : symbolToInstrument(r.Contract)
    if (!instrument) errors.push(`Fila ${i + 2}: símbolo desconocido "${r.Contract}"`)

    fills.push({
      orderId: r._id,
      symbol: r.Contract,
      instrument,
      time: new Date(r._timestamp),
      qty: dir * magnitude,
      price,
      points: null,
      profit: null,
      commission: Number(r.commission) || 0,
    })
  }

  return { fills, errors }
}
