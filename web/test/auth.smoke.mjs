import { chromium } from 'playwright'
const base = process.env.SMOKE_URL || 'http://localhost:5173'
const email = `t${Date.now()}@ex.com`
const b = await chromium.launch(); const p = await b.newPage()
await p.goto(base); await p.getByText('Regístrate').click()
await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill('password123')
await p.getByRole('button', { name: 'Registrarme' }).click()
await p.waitForSelector('text=APEX TRADER FUNDING', { timeout: 10000 })
console.log('OK: registro entra al dashboard'); await b.close()
