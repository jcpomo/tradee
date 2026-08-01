import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseImport } from '../src/import/parse.js'

const dir = dirname(fileURLToPath(import.meta.url))
const wcCsv = await readFile(join(dir, 'fixtures/orders.csv'), 'utf8')
const tvCsv = await readFile(join(dir, 'fixtures/tradovate-fills.csv'), 'utf8')

test('detecta WealthCharts', () => {
  const { platform, fills } = parseImport(wcCsv)
  assert.equal(platform, 'WealthCharts')
  assert.equal(fills.length, 114)
})

test('detecta Tradovate', () => {
  const { platform, fills } = parseImport(tvCsv)
  assert.equal(platform, 'Tradovate')
  assert.equal(fills.length, 16)
})

test('cabecera desconocida lanza', () => {
  assert.throws(() => parseImport('foo,bar\n1,2'), /no reconocido/i)
})
