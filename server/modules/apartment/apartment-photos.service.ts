import { and, asc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { apartmentPhotoOrderSchema } from '../../../shared/contracts/apartment-photos'
import { canManageApartment, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments } from '../../infrastructure/database/schema'

export async function reorderApartmentPhotos(actor: Actor, apartmentId: string, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  if (!(await canManageApartment(actor, apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к фотографиям' })
  const parsed = apartmentPhotoOrderSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Неверный порядок фотографий' })
  return db.transaction(async tx => {
    // Upload, removal and publication saves acquire the same parent lock.
    const [apartment] = await tx.select({ id: apartments.id }).from(apartments).where(and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId))).for('update')
    if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
    const scope = and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, 'apartment'), eq(attachments.entityId, apartmentId))
    const photos = await tx.select({ id: attachments.id }).from(attachments).where(scope)
    const ids = new Set(photos.map(photo => photo.id))
    if (photos.length !== parsed.data.photoIds.length || parsed.data.photoIds.some(id => !ids.has(id))) {
      throw createError({ statusCode: 409, statusMessage: 'Список фотографий изменился. Обновите страницу и повторите.' })
    }
    for (const [position, id] of parsed.data.photoIds.entries()) {
      await tx.update(attachments).set({ position }).where(and(scope, eq(attachments.id, id)))
    }
    return tx.select().from(attachments).where(scope).orderBy(asc(attachments.position), asc(attachments.createdAt), asc(attachments.id))
  })
}
