import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { authRoutes } from './auth/routes.js'
import { requireAuth } from './auth/requireAuth.js'
import { stateRoutes } from './routes/state.js'
import { tradesRoutes } from './routes/trades.js'

export function buildApp() {
  const app = Fastify({ logger: false })
  app.register(helmet)
  app.register(cors, { origin: config.webOrigin, credentials: true })
  app.register(cookie)
  app.register(jwt, { secret: config.jwtAccessSecret })
  app.register(jwt, { secret: config.jwtRefreshSecret, namespace: 'refresh', jwtVerify: 'jwtRefreshVerify', jwtSign: 'jwtRefreshSign' })
  app.decorate('jwtRefresh', {
    sign: (payload, opts) => app.jwt.refresh.sign(payload, opts),
    verify: (token) => app.jwt.refresh.verify(token),
  })
  app.register(async (scope) => {
    await scope.register(rateLimit, { max: 20, timeWindow: '1 minute' })
    await authRoutes(scope)
  })
  app.register(async (api) => {
    api.addHook('preHandler', requireAuth)
    await stateRoutes(api)
    await tradesRoutes(api)
  }, { prefix: '/api' })
  app.get('/health', async () => ({ status: 'ok' }))
  return app
}
