export async function requireAuth(req, reply) {
  try {
    const payload = await req.jwtVerify()
    if (payload.typ !== 'access') throw new Error('wrong type')
    req.userId = payload.sub
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: 'Sesión no válida' })
  }
}
