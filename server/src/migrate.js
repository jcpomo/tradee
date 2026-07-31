import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from './db.js'

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function runMigrations(pool = getPool()) {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const files = (await readdir(MIG_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const done = (await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name)
  const applied = []
  for (const file of files) {
    if (done.includes(file)) continue
    const sql = await readFile(join(MIG_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file])
      await client.query('COMMIT')
      applied.push(file)
    } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
  }
  return applied
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then((a) => { console.log('migraciones:', a.length ? a.join(', ') : '(ninguna)'); return closePool() })
    .catch((e) => { console.error(e); process.exit(1) })
}
