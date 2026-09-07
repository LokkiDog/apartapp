import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { canAccessAssignedWork, requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleaningProblems, cleanings, tasks } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { validateUploadedImage } from '../../modules/attachment/image-upload'
import { requireAcceptedCleaningAssignment } from '../../modules/cleaning/cleaning-acceptance'
import { publishCleaningChangeForId } from '../../modules/cleaning/cleaning-events'

const allowedTypes = new Set(['cleaning_problem', 'cleaning', 'task', 'apartment'])
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const form = await readMultipartFormData(event)
  const entityType = form?.find(item => item.name === 'entityType')?.data.toString()
  const entityId = form?.find(item => item.name === 'entityId')?.data.toString()
  const file = form?.find(item => item.name === 'file')
  if (!entityType || !entityId || !file || !allowedTypes.has(entityType)) throw createError({ statusCode: 400, statusMessage: 'Неверные данные файла' })
  if (file.data.byteLength > 8 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Файл больше 8 МБ' })
  const mimeType = await validateUploadedImage(file.data, file.type ?? '')
  let storedEntityType = entityType
  let storedEntityId = entityId
  let cleaningIdForRealtime: string | null = null
  const allowed = await (async () => {
    if (entityType === 'apartment') {
      const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, entityId), eq(apartments.organizationId, actor.organizationId)) })
      if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
      return actor.roles.includes('administrator')
    }
    if (entityType === 'cleaning_problem') {
      const problem = await db.query.cleaningProblems.findFirst({ where: and(eq(cleaningProblems.id, entityId), eq(cleaningProblems.organizationId, actor.organizationId)), with: { cleaning: { with: { assignments: true } } } })
      if (!problem) throw createError({ statusCode: 404, statusMessage: 'Проблема не найдена' })
      const canUpload = actor.roles.includes('administrator') || Boolean(problem.cleaning?.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId)))
      if (canUpload && problem.cleaningId && !actor.roles.includes('administrator')) await requireAcceptedCleaningAssignment(actor, problem.cleaningId)
      cleaningIdForRealtime = problem.cleaningId
      return canUpload
    }
    if (entityType === 'cleaning') {
      const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, entityId), eq(cleanings.organizationId, actor.organizationId)), with: { assignments: true, problems: true } })
      if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
      const canUpload = cleaning.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId))
      if (canUpload) await requireAcceptedCleaningAssignment(actor, entityId)
      if (!cleaning.problems[0]) throw createError({ statusCode: 400, statusMessage: 'Сначала добавьте проблему' })
      storedEntityType = 'cleaning_problem'
      storedEntityId = cleaning.problems[0].id
      cleaningIdForRealtime = cleaning.id
      return canUpload
    }
    const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, entityId), eq(tasks.organizationId, actor.organizationId)) })
    if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
    return canAccessAssignedWork(actor, task.assigneeId)
  })()
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к файлу' })
  const fileName = file.filename || 'photo.jpg'
  const storageKey = `${actor.organizationId}/${storedEntityType}/${storedEntityId}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await fileStorage.put(storageKey, file.data)
  const attachment = (await db.insert(attachments).values({ organizationId: actor.organizationId, entityType: storedEntityType, entityId: storedEntityId, fileName, mimeType, storageKey, uploadedById: actor.id }).returning())[0]
  if (cleaningIdForRealtime) await publishCleaningChangeForId(actor, cleaningIdForRealtime, 'progress')
  return attachment
})
