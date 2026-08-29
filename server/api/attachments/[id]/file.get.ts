import { and, eq } from 'drizzle-orm'
import sharp from 'sharp'
import { canAccessAssignedWork, canManageApartment, requireActor } from '../../../infrastructure/auth/actor'
import { db } from '../../../infrastructure/database/client'
import { apartments, attachments, cleanings, tasks } from '../../../infrastructure/database/schema'
import { CARD_PREVIEW_SUFFIX, fileStorage } from '../../../infrastructure/storage/local'

async function getCardPreview(storageKey: string) {
  const previewKey = `${storageKey}${CARD_PREVIEW_SUFFIX}`
  try {
    return await fileStorage.get(previewKey)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
  const original = await fileStorage.get(storageKey)
  const preview = await sharp(original)
    .rotate()
    .resize({ width: 960, height: 480, fit: 'cover', position: 'centre', withoutEnlargement: true })
    .webp({ quality: 78, smartSubsample: true })
    .toBuffer()
  await fileStorage.put(previewKey, preview)
  return preview
}

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const attachment = await db.query.attachments.findFirst({ where: and(eq(attachments.id, getRouterParam(event, 'id')!), eq(attachments.organizationId, actor.organizationId)) })
  if (!attachment) throw createError({ statusCode: 404, statusMessage: 'Файл не найден' })
  if (!actor.roles.includes('administrator')) {
    const allowed = attachment.entityType === 'apartment'
      ? await canManageApartment(actor, attachment.entityId)
      : attachment.entityType === 'cleaning'
      ? await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, attachment.entityId), eq(cleanings.organizationId, actor.organizationId)), with: { assignments: true } }).then(cleaning => Boolean(cleaning && cleaning.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId))))
      : await db.query.tasks.findFirst({ where: and(eq(tasks.id, attachment.entityId), eq(tasks.organizationId, actor.organizationId)) }).then(task => Boolean(task && canAccessAssignedWork(actor, task.assigneeId)))
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к файлу' })
  }
  const isCardPreview = getQuery(event).variant === 'card'
  const etag = `"${attachment.id}-${isCardPreview ? 'card-v1' : 'original'}"`
  setHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
  setHeader(event, 'etag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }
  setHeader(event, 'content-type', isCardPreview ? 'image/webp' : attachment.mimeType)
  setHeader(event, 'content-disposition', `inline; filename="${attachment.fileName.replace(/[\r\n"]/g, '')}"`)
  return isCardPreview ? getCardPreview(attachment.storageKey) : fileStorage.get(attachment.storageKey)
})
