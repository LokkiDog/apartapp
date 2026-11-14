import { messagingTemplateSchema } from '../../../../shared/contracts/messaging-template'
import { db } from '../../../infrastructure/database/client'
import { messagingTemplates } from '../../../infrastructure/database/schema'
import { requireMessagingActor } from '../../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  const input = await readValidatedBody(event, messagingTemplateSchema.parse)
  const [template] = await db.insert(messagingTemplates).values({
    ...input, organizationId: actor.organizationId,
  }).returning({ id: messagingTemplates.id, name: messagingTemplates.name, text: messagingTemplates.text })
  return template!
})
