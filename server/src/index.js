import { buildApp } from './app.js'
import { config } from './config.js'
import { runMigrations } from './migrate.js'
const start = async () => {
  const applied = await runMigrations()
  console.log('migraciones:', applied.length ? applied.join(', ') : 'al día')
  const app = buildApp()
  await app.listen({ port: config.port, host: config.host })
  console.log(`server on :${config.port}`)
}
start().catch((err) => { console.error(err); process.exit(1) })
