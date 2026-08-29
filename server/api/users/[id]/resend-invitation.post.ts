import { requireActor, requireRole } from '../../../infrastructure/auth/actor'
import { resendInvitation } from '../../../modules/auth/account.service'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const userId = getRouterParam(event, 'id')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Пользователь не найден' })
  return resendInvitation(actor, userId)
})
