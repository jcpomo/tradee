import { chromium } from 'playwright'
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

// abre el selector de cuentas y lanza el modal de alta
await p.locator('button:has-text("Sin cuenta"), button:has-text("Mi 50K")').first().click()
await p.getByText('➕ Nueva cuenta').click()
await p.waitForSelector('text=Nueva cuenta', { timeout: 5000 })
console.log('OK: modal de nueva cuenta abierto')

// crea una cuenta EOD 100K
await p.locator('input[placeholder^="Mi "]').fill('Cuenta EOD 100K')
await p.getByRole('button', { name: 'EOD' }).click()
await p.locator('select').selectOption('100K')
await p.waitForSelector('text=Suelo inicial con este modo', { timeout: 5000 })
await p.getByRole('button', { name: 'Crear cuenta' }).click()

// el modal se cierra y el dashboard queda en la nueva cuenta
await p.waitForSelector('text=Nueva cuenta', { state: 'detached', timeout: 10000 })
await p.waitForSelector('text=Cuenta EOD 100K', { timeout: 10000 })
console.log('OK: cuenta creada y activada')

// el selector ahora lista 2 cuentas
await p.locator('button:has-text("Cuenta EOD 100K")').first().click()
const rows = await p.locator('ul li button').count()
if (rows < 2) throw new Error(`esperaba >=2 cuentas en el selector, hay ${rows}`)
const text = await p.locator('ul').first().innerText()
if (!text.includes('100K')) throw new Error('el selector no muestra la nueva cuenta de 100K')
console.log(`OK: selector lista ${rows} cuentas, incluyendo la nueva de 100K`)

await b.close()
console.log('SMOKE OK: alta de cuenta con presets')
