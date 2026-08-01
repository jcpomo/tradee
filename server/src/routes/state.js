import { resolveAccount, rowToAccount } from '../accounts/guard.js'
export async function stateRoutes(app) {
  app.get('/state', async (req, reply) => {
    const acc = await resolveAccount(req.userId, req.query.accountId)
    if (!acc) return reply.code(404).send({ error: 'no_account', message: 'Sin cuenta activa' })
    reply.send({ account: rowToAccount(acc) })
  })
}
