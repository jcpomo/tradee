import pg from 'pg'
import { config } from './config.js'
let pool
export function getPool() {
  if (!pool) pool = new pg.Pool({ connectionString: config.databaseUrl })
  return pool
}
export function query(text, params) { return getPool().query(text, params) }
export async function closePool() { if (pool) { await pool.end(); pool = undefined } }
