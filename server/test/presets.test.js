import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presetFor, PRESETS } from '../src/accounts/presets.js'

test('preset 50K trae los valores 4.0', () => {
  assert.deepEqual(presetFor('50K'), { initialBalance: 50000, maxDrawdown: 2000, profitTarget: 3000, maxContracts: 6 })
})
test('preset desconocido devuelve null', () => { assert.equal(presetFor('999K'), null) })
test('hay 9 presets', () => { assert.equal(Object.keys(PRESETS).length, 9) })
