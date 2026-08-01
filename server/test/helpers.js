import { runMigrations } from '../src/migrate.js'
import { query, closePool } from '../src/db.js'
import { buildApp } from '../src/app.js'
export async function setupTestDb() {
  await runMigrations()
  await query('TRUNCATE users RESTART IDENTITY CASCADE')
}
export function makeApp() { return buildApp() }
export async function closeAll() { await closePool() }
