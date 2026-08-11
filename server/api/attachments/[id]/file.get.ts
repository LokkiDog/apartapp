import { and, eq } from 'drizzle-orm'
import { requireActor } from '../../../infrastructure/auth/actor'
import { db } from '../../../infrastructure/database/client'
import { apartments, attachments, cleanings, tasks } from '../../../infrastructure/database/schema'
import { fileStorage } from '../../../infrastructure/storage/local'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const attachment = await db.query.attachments.findFirst({ where: and(eq(attachments.id, getRouterParam(event, 'id')!), eq(attachments.organizationId, actor.organizationId)) })
  if (!attachment) throw createError({ statusCode: 404, statusMessage: 'Файл не найден' })
  if (!actor.roles.includes('administrator')) {
    const allowed = attachment.entityType === 'apartment'
      ? await db.query.apartments.findFirst({ where: and(eq(apartments.id, attachment.entityId), eq(apartments.organizationId, actor.organizationId), eq(apartments.managerId, actor.id)) }).then(Boolean)
      : attachment.entityType === 'cleaning'
      ? await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, attachment.entityId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: true, assignments: true } }).then(cleaning => Boolean(cleaning && (cleaning.apartment.managerId === actor.id || cleaning.assignments.some(item => item.cleanerId === actor.id))))
      : await db.query.tasks.findFirst({ where: and(eq(tasks.id, attachment.entityId), eq(tasks.organizationId, actor.organizationId)), with: { apartment: true } }).then(task => Boolean(task && (task.apartment.managerId === actor.id || task.assigneeId === actor.id)))
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к файлу' })
  }
  setHeader(event, 'content-type', attachment.mimeType); setHeader(event, 'content-disposition', `inline; filename="${attachment.fileName.replace(/[\r\n"]/g, '')}"`)
  return fileStorage.get(attachment.storageKey)
})
