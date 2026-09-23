import { and, eq } from 'drizzle-orm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'
import { selectManualRecipients, sendNotificationSchema } from '../../infrastructure/notification/manual'
import { notifyUsers } from '../../infrastructure/notification/publish'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const input = sendNotificationSchema.parse(await readBody(event))
  const activeUsers = await db.select({ id: users.id, organizationId: users.organizationId, status: users.status, roles: users.roles }).from(users).where(and(
    eq(users.organizationId, actor.organizationId),
    eq(users.status, 'active')
  ))
  const { recipients, allSelectedActive } = selectManualRecipients(activeUsers, actor.organizationId, input.audience, input.userIds)
  if (!allSelectedActive) {
    throw createError({ statusCode: 400, statusMessage: 'Выберите активных пользователей своей организации' })
  }
  if (!recipients.length) throw createError({ statusCode: 400, statusMessage: 'Нет активных получателей' })

  const count = await notifyUsers({
    organizationId: actor.organizationId,
    userIds: recipients.map(user => user.id),
    type: 'manual',
    title: input.title,
    body: input.body,
    href: null
  })
  if (!count) throw createError({ statusCode: 400, statusMessage: 'Нет активных получателей' })
  return { count }
})
