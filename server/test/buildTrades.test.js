import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseOrders } from '../src/import/parseOrders.js'
import { parseImport } from '../src/import/parse.js'
import { buildTrades } from '../src/import/buildTrades.js'

const dir = dirname(fileURLToPath(import.meta.url))
const csv = await readFile(join(dir, 'fixtures/orders.csv'), 'utf8')
const tvCsv = await readFile(join(dir, 'fixtures/tradovate-fills.csv'), 'utf8')

test('reconstruye 57 trades', () => { assert.equal(buildTrades(parseOrders(csv).fills).length, 57) })
test('P&L neto -101.28', () => { const n = buildTrades(parseOrders(csv).fills).reduce((a, t) => a + t.pnl, 0); assert.equal(Math.round(n * 100) / 100, -101.28) })
test('campos coherentes', () => { for (const t of buildTrades(parseOrders(csv).fills)) { assert.ok(['LONG', 'SHORT'].includes(t.direction)); assert.ok(t.contracts >= 1); assert.ok(['WIN', 'LOSS', 'BE'].includes(t.result)); assert.ok(t.externalId) } })
test('externalId determinista', () => { const a = buildTrades(parseOrders(csv).fills).map((t) => t.externalId); const b = buildTrades(parseOrders(csv).fills).map((t) => t.externalId); assert.deepEqual(a, b) })

test('Tradovate: reconstruye 9 trades', () => {
  const { fills } = parseImport(tvCsv)
  assert.equal(buildTrades(fills).length, 9)
})
test('Tradovate: P&L neto -15.86', () => {
  const { fills } = parseImport(tvCsv)
  const n = buildTrades(fills).reduce((a, t) => a + t.pnl, 0)
  assert.equal(Math.round(n * 100) / 100, -15.86)
})
test('Tradovate: comisión total 9.36', () => {
  const { fills } = parseImport(tvCsv)
  const c = buildTrades(fills).reduce((a, t) => a + t.commission, 0)
  assert.equal(Math.round(c * 100) / 100, 9.36)
})
test('Tradovate: externalId determinista', () => {
  const { fills } = parseImport(tvCsv)
  const a = buildTrades(fills).map((t) => t.externalId)
  const b = buildTrades(fills).map((t) => t.externalId)
  assert.deepEqual(a, b)
})
