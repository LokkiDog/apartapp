import { eq } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import { messagingTemplates } from '../../../infrastructure/database/schema'
import { requireMessagingActor } from '../../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  return db.select({
    id: messagingTemplates.id, name: messagingTemplates.name, text: messagingTemplates.text,
  }).from(messagingTemplates)
    .where(eq(messagingTemplates.organizationId, actor.organizationId))
    .orderBy(messagingTemplates.name, messagingTemplates.id)
})
