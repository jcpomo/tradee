import { parse } from 'csv-parse/sync'
import { symbolToInstrument } from './instruments.js'

const EXPECTED = ['name', 'order_id', 'symbol', 'mov_time', 'mov_type', 'exec_qty', 'price_done', 'points', 'profit', 'created_on']

const numOrNull = (v) => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseOrders(csvText) {
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true })
  if (!records.length) throw new Error('El CSV no tiene filas')

  const cols = Object.keys(records[0])
  for (const c of EXPECTED) {
    if (!cols.includes(c)) throw new Error(`Cabecera inesperada: falta la columna "${c}"`)
  }

  const errors = [], fills = []
  for (const [i, r] of records.entries()) {
    const qty = numOrNull(r.exec_qty), price = numOrNull(r.price_done)
    if (qty === null || price === null) {
      errors.push(`Fila ${i + 2}: exec_qty/price_done no numéricos`)
      continue
    }
    const instrument = symbolToInstrument(r.symbol)
    if (!instrument) errors.push(`Fila ${i + 2}: símbolo desconocido "${r.symbol}"`)
    fills.push({
      orderId: r.order_id,
      symbol: r.symbol,
      instrument,
      time: new Date(r.mov_time),
      qty,
      price,
      points: numOrNull(r.points),
      profit: numOrNull(r.profit)
    })
  }

  return { fills, errors }
}
