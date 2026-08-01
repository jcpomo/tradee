import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseOrders } from '../src/import/parseOrders.js'

const dir = dirname(fileURLToPath(import.meta.url))
const csv = await readFile(join(dir, 'fixtures/orders.csv'), 'utf8')

test('parsea 114 fills', () => {
  const { fills, errors } = parseOrders(csv)
  assert.equal(errors.length, 0)
  assert.equal(fills.length, 114)
})

test('normaliza CM.MNQU6 a MNQ', () => {
  assert.equal(parseOrders(csv).fills[0].instrument, 'MNQ')
})

test('qty conserva signo', () => {
  const { fills } = parseOrders(csv)
  assert.ok(fills.some((f) => f.qty < 0) && fills.some((f) => f.qty > 0))
})

test('cabecera inválida lanza', () => {
  assert.throws(() => parseOrders('foo,bar\n1,2'), /cabecera|columna/i)
})
