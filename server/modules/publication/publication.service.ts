import { and, asc, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { publicationInputSchema, type PublicationInput } from '../../../shared/contracts/publication'
import { db } from '../../infrastructure/database/client'
import { apartments, apartmentPublications, apartmentPublicationPhotos, attachments, organizations } from '../../infrastructure/database/schema'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'

async function requireApartment(actor: Actor, apartmentId: string) {
  requireRole(actor, 'administrator')
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment
}
export async function getPublication(actor: Actor, apartmentId: string): Promise<PublicationInput> {
  await requireApartment(actor, apartmentId)
  const record = await db.select().from(apartmentPublications).where(and(eq(apartmentPublications.apartmentId, apartmentId), eq(apartmentPublications.organizationId, actor.organizationId))).limit(1)
  const publication = record[0]
  if (!publication) return { published: false, slug: `apartment-${apartmentId}`, sortOrder: 0, translations: { ru: { title: '', summary: '', description: '', location: '' } }, amenities: [], photoIds: [] }
  const photos = await db.select().from(apartmentPublicationPhotos).where(eq(apartmentPublicationPhotos.publicationId, publication.id)).orderBy(asc(apartmentPublicationPhotos.position))
  return { published: publication.published, slug: publication.slug, sortOrder: publication.sortOrder, translations: publication.translations, amenities: publication.amenities as PublicationInput['amenities'], photoIds: photos.map(photo => photo.attachmentId) }
}
export async function savePublication(actor: Actor, apartmentId: string, input: unknown) {
  await requireApartment(actor, apartmentId)
  const data = publicationInputSchema.parse(input)
  try {
    await db.transaction(async tx => {
      // Lock the apartment before validating photo membership, serializing publication saves.
      const [apartment] = await tx.select().from(apartments).where(and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId))).for('update')
      if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
      if (data.published && apartment.status !== 'active') throw createError({ statusCode: 400, statusMessage: 'Публиковать можно только активный апартамент' })
      if (data.photoIds.length) {
        const selected = await tx.select({ id: attachments.id }).from(attachments).where(and(inArray(attachments.id, data.photoIds), eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, 'apartment'), eq(attachments.entityId, apartmentId))).for('update')
        if (selected.length !== data.photoIds.length) throw createError({ statusCode: 400, statusMessage: 'Выберите фотографии этого апартамента' })
      }
      const { photoIds, ...values } = data
      const [saved] = await tx.insert(apartmentPublications).values({ ...values, apartmentId, organizationId: actor.organizationId }).onConflictDoUpdate({ target: apartmentPublications.apartmentId, set: { ...values, updatedAt: new Date() } }).returning()
      await tx.delete(apartmentPublicationPhotos).where(eq(apartmentPublicationPhotos.publicationId, saved!.id))
      if (photoIds.length) await tx.insert(apartmentPublicationPhotos).values(photoIds.map((attachmentId, position) => ({ publicationId: saved!.id, attachmentId, position })))
      // Gallery replacement may trigger automatic unpublishing; apply the validated state last.
      await tx.update(apartmentPublications).set({ published: data.published }).where(eq(apartmentPublications.id, saved!.id))
    })
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Такой адрес страницы уже используется' })
    throw error
  }
  return getPublication(actor, apartmentId)
}

export async function publicPublicationRows(organizationId: string, slug?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) throw createError({ statusCode: 503, statusMessage: 'Каталог ещё не настроен' })
  return db.select({ publication: apartmentPublications, capacity: apartments.capacity, rooms: apartments.rooms, checkInTime: apartments.checkInTime, checkOutTime: apartments.checkOutTime }).from(apartmentPublications)
    .innerJoin(apartments, and(eq(apartments.id, apartmentPublications.apartmentId), eq(apartments.organizationId, apartmentPublications.organizationId)))
    .innerJoin(organizations, eq(organizations.id, apartmentPublications.organizationId))
    .where(and(eq(apartmentPublications.organizationId, organizationId), eq(apartmentPublications.published, true), eq(apartments.status, 'active'), eq(organizations.status, 'active'), ...(slug ? [eq(apartmentPublications.slug, slug)] : [])))
    .orderBy(asc(apartmentPublications.sortOrder), asc(apartmentPublications.slug))
}
export async function publicPhotos(publicationId: string, organizationId: string, apartmentId: string) {
  return db.select({ id: attachments.id, storageKey: attachments.storageKey }).from(apartmentPublicationPhotos)
    .innerJoin(attachments, and(eq(attachments.id, apartmentPublicationPhotos.attachmentId), eq(attachments.organizationId, organizationId), eq(attachments.entityType, 'apartment'), eq(attachments.entityId, apartmentId)))
    .where(eq(apartmentPublicationPhotos.publicationId, publicationId)).orderBy(asc(apartmentPublicationPhotos.position))
}
export async function publicCatalogue(organizationId: string, slug?: string) {
  const rows = await publicPublicationRows(organizationId, slug)
  const result = await Promise.all(rows.map(async ({ publication, ...facts }) => {
    const photos = await publicPhotos(publication.id, organizationId, publication.apartmentId)
    if (!photos.length) return null
    const { title, summary, description, location } = publication.translations.ru
    return { slug: publication.slug, title, summary, description, location, ...facts, amenities: publication.amenities, photos: photos.map(photo => ({ id: photo.id, url: `/api/catalogue/apartments/${publication.slug}/photos/${photo.id}` })) }
  }))
  return result.filter((row): row is NonNullable<typeof row> => row !== null)
}
