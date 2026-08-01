import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const fixture = join(dir, '..', '..', 'server', 'test', 'fixtures', 'orders.csv')

const base = process.env.SMOKE_URL || 'http://localhost:5173'
const email = `t${Date.now()}@ex.com`
const b = await chromium.launch(); const p = await b.newPage()

await p.goto(base)
await p.getByText('Regístrate').click()
await p.locator('input[type=email]').fill(email)
await p.locator('input[type=password]').fill('password123')
await p.getByRole('button', { name: 'Registrarme' }).click()
await p.waitForSelector('text=APEX TRADER FUNDING', { timeout: 10000 })
console.log('OK: registro entra al dashboard')

// va a la pestaña Importar
await p.locator('button:has-text("Importar")').first().click()
await p.waitForSelector('text=Importar trades', { timeout: 5000 })
console.log('OK: pestaña Importar visible')

// sube el CSV de fixtures
await p.locator('input[type=file]').setInputFiles(fixture)
await p.waitForSelector('text=57', { timeout: 15000 })
console.log('OK: preview muestra 57')

// confirma la importación
await p.getByRole('button', { name: /Confirmar/ }).click()
await p.waitForSelector('text=/Importación confirmada/', { timeout: 15000 })
console.log('OK: importación confirmada')

// verifica en el Diario que hay 57 trades en total
await p.locator('button:has-text("Diario")').first().click()
await p.waitForSelector('text=Estadísticas globales', { timeout: 10000 })
const bodyText = await p.locator('text=Trades totales').locator('xpath=..').innerText()
if (!bodyText.includes('57')) {
  throw new Error(`esperaba 57 trades totales en el diario, obtuve: ${bodyText}`)
}
console.log('OK: el diario refleja 57 trades importados')

// vuelve a Importar y comprueba el historial + deshacer
await p.locator('button:has-text("Importar")').first().click()
await p.waitForSelector('text=Historial de importaciones', { timeout: 5000 })
await p.getByRole('button', { name: 'Deshacer' }).click()
await p.waitForSelector('text=/deshecho/', { timeout: 10000 })
console.log('OK: deshacer el lote funciona')

await b.close()
console.log('SMOKE OK: importación de CSV por cuenta')
