import { z } from 'zod'
import { requireSuperuser } from '../../../infrastructure/auth/platform'
import { listSystemNotifications } from '../../../infrastructure/notification/system'

const querySchema = z.object({ cursor: z.string().uuid().optional() })

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  const { cursor } = await getValidatedQuery(event, querySchema.parse)
  return listSystemNotifications(actor.id, cursor)
})
