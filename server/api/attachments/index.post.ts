import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { canAccessAssignedWork, requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleanings, tasks } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { validateUploadedImage } from '../../modules/attachment/image-upload'

const allowedTypes = new Set(['cleaning', 'task', 'apartment'])
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const form = await readMultipartFormData(event)
  const entityType = form?.find(item => item.name === 'entityType')?.data.toString()
  const entityId = form?.find(item => item.name === 'entityId')?.data.toString()
  const file = form?.find(item => item.name === 'file')
  if (!entityType || !entityId || !file || !allowedTypes.has(entityType)) throw createError({ statusCode: 400, statusMessage: 'Неверные данные файла' })
  if (file.data.byteLength > 8 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Файл больше 8 МБ' })
  const mimeType = await validateUploadedImage(file.data, file.type ?? '')
  const allowed = await (async () => {
    if (entityType === 'apartment') {
      const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, entityId), eq(apartments.organizationId, actor.organizationId)) })
      if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
      return actor.roles.includes('administrator')
    }
    if (entityType === 'cleaning') {
      const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, entityId), eq(cleanings.organizationId, actor.organizationId)), with: { assignments: true } })
      if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
      return cleaning.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId))
    }
    const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, entityId), eq(tasks.organizationId, actor.organizationId)) })
    if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
    return canAccessAssignedWork(actor, task.assigneeId)
  })()
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к файлу' })
  const fileName = file.filename || 'photo.jpg'
  const storageKey = `${actor.organizationId}/${entityType}/${entityId}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await fileStorage.put(storageKey, file.data)
  return (await db.insert(attachments).values({ organizationId: actor.organizationId, entityType, entityId, fileName, mimeType, storageKey, uploadedById: actor.id }).returning())[0]
})
