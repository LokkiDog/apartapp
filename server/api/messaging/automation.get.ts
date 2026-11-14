import { eq } from 'drizzle-orm'
import { defaultMessagingAutomation } from '../../../shared/contracts/messaging-automation'
import { db } from '../../infrastructure/database/client'
import { organizations } from '../../infrastructure/database/schema'
import { requireMessagingActor } from '../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  const [organization] = await db.select({
    settings: organizations.messagingAutomation,
    timezone: organizations.timezone,
  }).from(organizations).where(eq(organizations.id, actor.organizationId))
  if (!organization) throw createError({ statusCode: 404 })
  return { settings: organization.settings ?? defaultMessagingAutomation(), timezone: organization.timezone }
})
