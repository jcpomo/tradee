import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { isTradovateFills, parseTradovateFillsRecords } from '../src/import/parseTradovate.js'

const dir = dirname(fileURLToPath(import.meta.url))
const csv = await readFile(join(dir, 'fixtures/tradovate-fills.csv'), 'utf8')
const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true })

test('detecta cabecera Tradovate Fills', () => {
  assert.ok(isTradovateFills(Object.keys(records[0])))
})

test('parsea 16 fills', () => {
  const { fills, errors } = parseTradovateFillsRecords(records)
  assert.equal(errors.length, 0)
  assert.equal(fills.length, 16)
})

test('direcciones con ambos signos', () => {
  const { fills } = parseTradovateFillsRecords(records)
  assert.ok(fills.some((f) => f.qty > 0) && fills.some((f) => f.qty < 0))
})

test('instrumento normalizado a MNQ', () => {
  const { fills } = parseTradovateFillsRecords(records)
  assert.ok(fills.every((f) => f.instrument === 'MNQ'))
})

test('comisión parseada', () => {
  const { fills } = parseTradovateFillsRecords(records)
  assert.ok(fills.every((f) => typeof f.commission === 'number' && f.commission > 0))
  const total = fills.reduce((a, f) => a + f.commission, 0)
  assert.equal(Math.round(total * 100) / 100, 9.36)
})
