import { z } from 'zod'
import { requireSuperuser } from '../../../../infrastructure/auth/platform'
import { readSystemNotification } from '../../../../infrastructure/notification/system'

const paramsSchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  return readSystemNotification(actor.id, id)
})
