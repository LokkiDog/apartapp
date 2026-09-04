import { and, eq } from 'drizzle-orm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { attachments } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const attachmentId = getRouterParam(event, 'id')!
  const attachment = await db.query.attachments.findFirst({ where: and(eq(attachments.id, attachmentId), eq(attachments.organizationId, actor.organizationId)) })
  if (!attachment || attachment.entityType !== 'apartment') throw createError({ statusCode: 404, statusMessage: 'Фотография не найдена' })
  await db.delete(attachments).where(eq(attachments.id, attachment.id))
  await Promise.allSettled([fileStorage.remove(attachment.storageKey)])
  return { id: attachment.id }
})
