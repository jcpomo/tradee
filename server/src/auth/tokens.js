import crypto from 'node:crypto'
export const ACCESS_TTL = '15m'
export const REFRESH_TTL_DAYS = 30
export function signAccess(app, sub) { return app.jwt.sign({ sub, typ: 'access' }, { expiresIn: ACCESS_TTL }) }
export function signRefresh(app, sub) {
  const jti = crypto.randomUUID()
  const token = app.jwtRefresh.sign({ sub, jti, typ: 'refresh' }, { expiresIn: `${REFRESH_TTL_DAYS}d` })
  return { token, jti, expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400000) }
}
export function refreshCookieOpts(isProd) {
  return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/auth', maxAge: REFRESH_TTL_DAYS * 86400 }
}
