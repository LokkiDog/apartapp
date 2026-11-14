import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../infrastructure/database/client'
import { messagingTemplates } from '../../../infrastructure/database/schema'
import { requireMessagingActor } from '../../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const [template] = await db.delete(messagingTemplates).where(and(
    eq(messagingTemplates.id, id), eq(messagingTemplates.organizationId, actor.organizationId),
  )).returning({ id: messagingTemplates.id })
  if (!template) throw createError({ statusCode: 404 })
  return template
})
