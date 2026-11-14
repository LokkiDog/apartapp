import { and, eq } from 'drizzle-orm'
import { messagingAutomationSchema } from '../../../shared/contracts/messaging-automation'
import { db } from '../../infrastructure/database/client'
import { organizations } from '../../infrastructure/database/schema'
import { requireMessagingActor } from '../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  const settings = await readValidatedBody(event, messagingAutomationSchema.parse)
  const [organization] = await db.update(organizations).set({
    messagingAutomation: settings,
    updatedAt: new Date(),
  }).where(and(
    eq(organizations.id, actor.organizationId),
    eq(organizations.status, 'active'),
    eq(organizations.messagingEnabled, true),
  )).returning({ timezone: organizations.timezone })
  if (!organization) throw createError({ statusCode: 403 })
  return { settings, timezone: organization.timezone }
})
