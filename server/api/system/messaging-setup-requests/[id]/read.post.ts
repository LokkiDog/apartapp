import { z } from 'zod'
import { requireSuperuser } from '../../../../infrastructure/auth/platform'
import { acknowledgeMessagingSetupRequest } from '../../../../modules/messaging/setup-requests'

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Некорректная заявка' })
  return acknowledgeMessagingSetupRequest(actor.id, id.data)
})
