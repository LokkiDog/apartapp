import { and, eq } from 'drizzle-orm'
import { canManageApartment, requireActor, requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { attachments } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const attachmentId = getRouterParam(event, 'id')!
  const attachment = await db.query.attachments.findFirst({ where: and(eq(attachments.id, attachmentId), eq(attachments.organizationId, actor.organizationId)) })
  if (!attachment || attachment.entityType !== 'apartment') throw createError({ statusCode: 404, statusMessage: 'Фотография не найдена' })
  if (!actor.roles.includes('administrator')) {
    requireRole(actor, 'manager')
    if (!(await canManageApartment(actor, attachment.entityId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к фотографии' })
  }
  await db.delete(attachments).where(eq(attachments.id, attachment.id))
  await Promise.allSettled([fileStorage.remove(attachment.storageKey)])
  return { id: attachment.id }
})
