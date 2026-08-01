import { parse } from 'csv-parse/sync'
import { parseOrdersRecords } from './parseOrders.js'
import { isTradovateFills, parseTradovateFillsRecords } from './parseTradovate.js'

const WEALTHCHARTS_REQUIRED = ['order_id', 'mov_time', 'exec_qty', 'price_done', 'profit']

export function parseImport(csvText) {
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true })
  if (!records.length) throw new Error('El CSV no tiene filas')

  const cols = Object.keys(records[0])

  if (WEALTHCHARTS_REQUIRED.every((c) => cols.includes(c))) {
    return { ...parseOrdersRecords(records), platform: 'WealthCharts' }
  }
  if (isTradovateFills(cols)) {
    return { ...parseTradovateFillsRecords(records), platform: 'Tradovate' }
  }
  throw new Error('Formato de CSV no reconocido (ni WealthCharts ni Tradovate Fills)')
}
