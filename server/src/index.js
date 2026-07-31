import { buildApp } from './app.js'
import { config } from './config.js'
const app = buildApp()
app.listen({ port: config.port, host: config.host })
  .then(() => console.log(`server on :${config.port}`))
  .catch((err) => { console.error(err); process.exit(1) })
