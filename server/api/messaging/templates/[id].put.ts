import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { messagingTemplateSchema } from '../../../../shared/contracts/messaging-template'
import { db } from '../../../infrastructure/database/client'
import { messagingTemplates } from '../../../infrastructure/database/schema'
import { requireMessagingActor } from '../../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const input = await readValidatedBody(event, messagingTemplateSchema.parse)
  const [template] = await db.update(messagingTemplates).set(input).where(and(
    eq(messagingTemplates.id, id), eq(messagingTemplates.organizationId, actor.organizationId),
  )).returning({ id: messagingTemplates.id, name: messagingTemplates.name, text: messagingTemplates.text })
  if (!template) throw createError({ statusCode: 404 })
  return template
})
