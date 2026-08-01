import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcFloorByMode } from '../src/utils/calculations.js'

const base = { initialBalance: 50000, maxDrawdown: 2000, currentBalance: 51000, peakBalance: 51000, dailyCloses: [] }

test('intraday: suelo = peak - dd, con flotante', () => {
  assert.equal(calcFloorByMode({ ...base, mode: 'intraday' }), 49000)
})
test('intraday: topa en initial+100 (safety net)', () => {
  assert.equal(calcFloorByMode({ ...base, mode: 'intraday', peakBalance: 60000, currentBalance: 60000 }), 50100)
})
test('static: suelo fijo = initial - dd', () => {
  assert.equal(calcFloorByMode({ ...base, mode: 'static', peakBalance: 60000 }), 48000)
})
test('eod: usa cierres diarios, no el flotante', () => {
  // sin cierres: peak eod = initial → suelo 48000, aunque el balance vivo sea 51000
  assert.equal(calcFloorByMode({ ...base, mode: 'eod', dailyCloses: [] }), 48000)
  // con un cierre a 50800: peak eod = 50800 → suelo 48800
  assert.equal(calcFloorByMode({ ...base, mode: 'eod', dailyCloses: [50800] }), 48800)
})
