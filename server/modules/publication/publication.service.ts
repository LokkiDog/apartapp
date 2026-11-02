import { and, asc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { publicationInputSchema, publicCopyFields, type PublicationInput } from '../../../shared/contracts/publication'
import { db } from '../../infrastructure/database/client'
import { apartments, apartmentPublications, attachments, hotels, organizations } from '../../infrastructure/database/schema'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { resolvePublicationSlug } from './publication-slug'
import { publicMapLocation } from './publication-map'

async function requireApartment(actor: Actor, apartmentId: string) {
  requireRole(actor, 'administrator')
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment
}
export async function getPublication(actor: Actor, apartmentId: string): Promise<PublicationInput> {
  const apartment = await requireApartment(actor, apartmentId)
  const record = await db.select().from(apartmentPublications).where(and(eq(apartmentPublications.apartmentId, apartmentId), eq(apartmentPublications.organizationId, actor.organizationId))).limit(1)
  const publication = record[0]
  const photos = await publicPhotos(actor.organizationId, apartmentId)
  if (!publication || (!publication.published && [
    `apartment-${apartmentId}`, resolvePublicationSlug(apartment.name, '', new Set()),
  ].includes(publication.slug))) {
    const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.id, apartment.hotelId), eq(hotels.organizationId, actor.organizationId)) })
    const rows = await db.select({ slug: apartmentPublications.slug, apartmentId: apartmentPublications.apartmentId }).from(apartmentPublications).where(eq(apartmentPublications.organizationId, actor.organizationId))
    const occupied = new Set(rows.filter(row => row.apartmentId !== apartmentId).map(row => row.slug))
    const slug = resolvePublicationSlug(apartment.name, hotel?.name ?? '', occupied)
    if (!publication) return { published: false, slug, sortOrder: 0, translations: { ru: { title: apartment.name, summary: '', description: '', location: '' } }, amenities: [], photoIds: photos.map(photo => photo.id) }
    publication.slug = slug
  }
  return { published: publication.published, slug: publication.slug, sortOrder: publication.sortOrder, translations: { ...publication.translations, ru: { ...publication.translations.ru, title: publication.translations.ru.title.trim() ? publication.translations.ru.title : apartment.name } }, amenities: publication.amenities as PublicationInput['amenities'], photoIds: photos.map(photo => photo.id) }
}
export async function savePublication(actor: Actor, apartmentId: string, input: unknown) {
  await requireApartment(actor, apartmentId)
  const data = publicationInputSchema.parse(input)
  try {
    await db.transaction(async tx => {
      // Serialize default slug allocation within the organization, including concurrent forms.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`publication-slug:${actor.organizationId}`}))`)
      // Lock the apartment before validating photo membership, serializing publication saves.
      const [apartment] = await tx.select().from(apartments).where(and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId))).for('update')
      if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
      if (data.published && apartment.status !== 'active') throw createError({ statusCode: 400, statusMessage: 'Публиковать можно только активный апартамент' })
      const photos = await tx.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, 'apartment'), eq(attachments.entityId, apartmentId))).for('update')
      if (data.published && !photos.length) throw createError({ statusCode: 400, statusMessage: 'Добавьте хотя бы одно фото квартиры' })
      // Older clients may still send photoIds; they cannot restrict the public gallery.
      const availableIds = new Set(photos.map(photo => photo.id))
      if (data.photoIds.some(id => !availableIds.has(id))) throw createError({ statusCode: 400, statusMessage: 'Фотографии должны принадлежать этому апартаменту' })
      const { photoIds: requestedPhotoIds, ...values } = data
      const publications = await tx.select({ slug: apartmentPublications.slug, apartmentId: apartmentPublications.apartmentId, published: apartmentPublications.published }).from(apartmentPublications).where(eq(apartmentPublications.organizationId, actor.organizationId))
      const existing = publications.find(row => row.apartmentId === apartmentId)
      if (!existing || (!existing.published && [
        `apartment-${apartmentId}`, resolvePublicationSlug(apartment.name, '', new Set()),
      ].includes(existing.slug))) {
        const [hotel] = await tx.select({ name: hotels.name }).from(hotels).where(and(eq(hotels.id, apartment.hotelId), eq(hotels.organizationId, actor.organizationId)))
        const occupied = new Set(publications.filter(row => row.apartmentId !== apartmentId).map(row => row.slug))
        const preferred = values.slug === `apartment-${apartmentId}` ? undefined : values.slug
        values.slug = resolvePublicationSlug(apartment.name, hotel?.name ?? '', occupied, preferred)
      }
      await tx.insert(apartmentPublications).values({ ...values, apartmentId, organizationId: actor.organizationId }).onConflictDoUpdate({ target: apartmentPublications.apartmentId, set: { ...values, updatedAt: new Date() } })
    })
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Такой адрес страницы уже используется' })
    throw error
  }
  return getPublication(actor, apartmentId)
}

export async function publicPublicationRows(organizationId: string, slug?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) throw createError({ statusCode: 503, statusMessage: 'Каталог ещё не настроен' })
  return db.select({ hotelId: hotels.id, hotelName: hotels.name, latitude: hotels.latitude, longitude: hotels.longitude, publication: apartmentPublications, capacity: apartments.capacity, rooms: apartments.rooms, checkInTime: apartments.checkInTime, checkOutTime: apartments.checkOutTime }).from(apartmentPublications)
    .innerJoin(apartments, and(eq(apartments.id, apartmentPublications.apartmentId), eq(apartments.organizationId, apartmentPublications.organizationId)))
    .leftJoin(hotels, and(eq(hotels.id, apartments.hotelId), eq(hotels.organizationId, apartmentPublications.organizationId)))
    .innerJoin(organizations, eq(organizations.id, apartmentPublications.organizationId))
    .where(and(eq(apartmentPublications.organizationId, organizationId), eq(apartmentPublications.published, true), eq(apartments.status, 'active'), eq(organizations.status, 'active'), ...(slug ? [eq(apartmentPublications.slug, slug)] : [])))
    .orderBy(asc(apartmentPublications.sortOrder), asc(apartmentPublications.slug))
}
export async function publicPhotos(organizationId: string, apartmentId: string) {
  return db.select({ id: attachments.id, storageKey: attachments.storageKey }).from(attachments)
    .where(and(eq(attachments.organizationId, organizationId), eq(attachments.entityType, 'apartment'), eq(attachments.entityId, apartmentId)))
    .orderBy(asc(attachments.position), asc(attachments.createdAt), asc(attachments.id))
}
export async function publicCatalogue(organizationId: string, slug?: string, locale = 'ru') {
  const rows = await publicPublicationRows(organizationId, slug)
  const result = await Promise.all(rows.map(async ({ publication, hotelId, hotelName, latitude, longitude, ...facts }) => {
    const photos = await publicPhotos(organizationId, publication.apartmentId)
    if (!photos.length) return null
    const localized = publication.translations[locale as keyof typeof publication.translations]
    const [title, summary, description, location] = publicCopyFields.map(field => localized?.[field]?.trim() || publication.translations.ru[field])
    return { slug: publication.slug, title, summary, description, location, ...facts, hotel: hotelId && hotelName ? { id: hotelId, name: hotelName } : null, mapLocation: publicMapLocation({ hotelId, hotelName, latitude, longitude }), amenities: publication.amenities, photos: photos.map(photo => ({ id: photo.id, url: `/api/catalogue/apartments/${publication.slug}/photos/${photo.id}` })) }
  }))
  return result.filter((row): row is NonNullable<typeof row> => row !== null)
}
