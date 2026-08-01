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
const r2 = (v) => Math.round(v * 100) / 100

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

// Sintético: Buy 3 @ 100.0 luego Sell 3 @ 110.0 en MNQ (pointValue 2).
// Cubre Fix 1 (points por unidad, no escalado por contratos) y Fix 2
// (contracts = pico de posición, pnl usa cantidad round-tripped).
test('multi-contrato: contracts=pico, points por unidad, pnl con qty cerrada', () => {
  const fills = [
    { orderId: 'A1', symbol: 'MNQ', instrument: 'MNQ', time: new Date('2026-01-01T10:00:00Z'), qty: 3, price: 100.0, points: null, profit: null, commission: 1.5 },
    { orderId: 'A2', symbol: 'MNQ', instrument: 'MNQ', time: new Date('2026-01-01T10:05:00Z'), qty: -3, price: 110.0, points: null, profit: null, commission: 1.5 },
  ]
  const trades = buildTrades(fills)
  assert.equal(trades.length, 1)
  const t = trades[0]
  assert.equal(t.direction, 'LONG')
  assert.equal(t.contracts, 3)
  assert.equal(t.points, 10) // (110-100)*1, NOT *3
  assert.equal(t.pnl, r2(10 * 2 * 3 - 3.0)) // 57
  assert.equal(t.pnl, 57)
})

// Reversión: long 1, sell 2 (cierra el long y abre un short de 1), buy 1 (cierra el short).
// Debe partirse en 2 trades: uno LONG de 1 contrato y uno SHORT de 1 contrato.
test('multi-contrato: reversión en un mismo fill se divide en 2 trades', () => {
  const fills = [
    { orderId: 'B1', symbol: 'MNQ', instrument: 'MNQ', time: new Date('2026-01-02T10:00:00Z'), qty: 1, price: 100.0, points: null, profit: null, commission: 0.5 },
    { orderId: 'B2', symbol: 'MNQ', instrument: 'MNQ', time: new Date('2026-01-02T10:05:00Z'), qty: -2, price: 105.0, points: null, profit: null, commission: 1.0 },
    { orderId: 'B3', symbol: 'MNQ', instrument: 'MNQ', time: new Date('2026-01-02T10:10:00Z'), qty: 1, price: 103.0, points: null, profit: null, commission: 0.5 },
  ]
  const trades = buildTrades(fills)
  assert.equal(trades.length, 2)
  const [first, second] = trades
  assert.equal(first.direction, 'LONG')
  assert.equal(first.contracts, 1)
  assert.equal(second.direction, 'SHORT')
  assert.equal(second.contracts, 1)
})
