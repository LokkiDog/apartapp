import { and, count, eq } from 'drizzle-orm'
import { hotelInputSchema } from '@contracts/crm'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartmentManagers, apartments, cleaningAssignments, cleanings, hotels, tasks } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { deleteApartmentRecords } from '../apartment/apartment.service'
import { serializeApartment } from '../apartment/apartment-view'

export async function listHotels(actor: Actor) {
  if (actor.roles.includes('administrator')) {
    return db.query.hotels.findMany({ where: eq(hotels.organizationId, actor.organizationId), orderBy: (hotels, { asc }) => [asc(hotels.name)] })
  }

  const rows = await db.selectDistinct({ hotel: hotels }).from(apartments)
    .innerJoin(apartmentManagers, eq(apartmentManagers.apartmentId, apartments.id))
    .innerJoin(hotels, eq(apartments.hotelId, hotels.id))
    .where(and(eq(apartments.organizationId, actor.organizationId), eq(apartmentManagers.organizationId, actor.organizationId), eq(apartmentManagers.userId, actor.id)))
  if (!actor.roles.includes('cleaner')) return rows.map(row => row.hotel)
  const assignedCleaningHotels = await db.selectDistinct({ hotel: hotels }).from(cleaningAssignments)
    .innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id))
    .innerJoin(apartments, eq(cleanings.apartmentId, apartments.id))
    .innerJoin(hotels, eq(apartments.hotelId, hotels.id))
    .where(and(eq(cleaningAssignments.cleanerId, actor.id), eq(hotels.organizationId, actor.organizationId)))
  const taskHotels = await db.selectDistinct({ hotel: hotels }).from(tasks)
    .innerJoin(apartments, eq(tasks.apartmentId, apartments.id))
    .innerJoin(hotels, eq(apartments.hotelId, hotels.id))
    .where(and(eq(tasks.assigneeId, actor.id), eq(hotels.organizationId, actor.organizationId)))
  return [...new Map([...rows, ...assignedCleaningHotels, ...taskHotels].map(row => [row.hotel.id, row.hotel])).values()]
}

export async function createHotel(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = hotelInputSchema.parse(input)
  const [hotel] = await db.insert(hotels).values({
    organizationId: actor.organizationId,
    ...data,
    latitude: String(data.latitude),
    longitude: String(data.longitude)
  }).returning()
  if (!hotel) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать отель' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'hotel.created', entityType: 'hotel', entityId: hotel.id, payload: data })
  return hotel
}

export async function getHotel(actor: Actor, hotelId: string) {
  const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.id, hotelId), eq(hotels.organizationId, actor.organizationId)) })
  if (!hotel) throw createError({ statusCode: 404, statusMessage: 'Отель не найден' })
  if (!actor.roles.includes('administrator')) {
    const allowed = await db.select({ id: apartments.id }).from(apartments)
      .innerJoin(apartmentManagers, eq(apartmentManagers.apartmentId, apartments.id))
      .where(and(eq(apartments.hotelId, hotelId), eq(apartments.organizationId, actor.organizationId), eq(apartmentManagers.organizationId, actor.organizationId), eq(apartmentManagers.userId, actor.id)))
      .limit(1)
    if (!allowed.length) {
      const cleaningAccess = await db.select({ id: cleanings.id }).from(cleaningAssignments).innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id)).innerJoin(apartments, eq(cleanings.apartmentId, apartments.id)).where(and(eq(cleaningAssignments.cleanerId, actor.id), eq(apartments.hotelId, hotelId))).limit(1)
      const taskAccess = await db.select({ id: tasks.id }).from(tasks).innerJoin(apartments, eq(tasks.apartmentId, apartments.id)).where(and(eq(tasks.assigneeId, actor.id), eq(apartments.hotelId, hotelId))).limit(1)
      if (!cleaningAccess.length && !taskAccess.length) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к отелю' })
    }
  }
  return hotel
}

export async function updateHotel(actor: Actor, hotelId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = hotelInputSchema.parse(input)
  const [hotel] = await db.update(hotels).set({ ...data, latitude: String(data.latitude), longitude: String(data.longitude), updatedAt: new Date() })
    .where(and(eq(hotels.id, hotelId), eq(hotels.organizationId, actor.organizationId))).returning()
  if (!hotel) throw createError({ statusCode: 404, statusMessage: 'Отель не найден' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'hotel.updated', entityType: 'hotel', entityId: hotel.id, payload: data })
  return hotel
}

export async function archiveHotel(actor: Actor, hotelId: string) {
  requireRole(actor, 'administrator')
  const [active] = await db.select({ total: count() }).from(apartments).where(and(eq(apartments.hotelId, hotelId), eq(apartments.status, 'active')))
  if ((active?.total ?? 0) > 0) throw createError({ statusCode: 409, statusMessage: 'Нельзя архивировать отель с активными апартаментами' })
  const [hotel] = await db.update(hotels).set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(hotels.id, hotelId), eq(hotels.organizationId, actor.organizationId))).returning()
  if (!hotel) throw createError({ statusCode: 404, statusMessage: 'Отель не найден' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'hotel.archived', entityType: 'hotel', entityId: hotel.id })
  return hotel
}

export async function deleteHotel(actor: Actor, hotelId: string) {
  requireRole(actor, 'administrator')
  const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.id, hotelId), eq(hotels.organizationId, actor.organizationId)) })
  if (!hotel) throw createError({ statusCode: 404, statusMessage: 'Отель не найден' })

  const storageKeys = await db.transaction(async tx => {
    const hotelApartments = await tx.select({ id: apartments.id }).from(apartments).where(and(eq(apartments.hotelId, hotelId), eq(apartments.organizationId, actor.organizationId)))
    const keys = [] as string[]
    for (const apartment of hotelApartments) keys.push(...await deleteApartmentRecords(tx, apartment.id))
    await tx.delete(hotels).where(eq(hotels.id, hotelId))
    return keys
  })
  await Promise.allSettled(storageKeys.map(storageKey => fileStorage.remove(storageKey)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'hotel.deleted', entityType: 'hotel', entityId: hotelId })
  return { ok: true }
}

export async function listHotelApartments(actor: Actor, hotelId: string) {
  await getHotel(actor, hotelId)
  return db.query.apartments.findMany({
    where: actor.roles.includes('administrator')
      ? and(eq(apartments.hotelId, hotelId), eq(apartments.organizationId, actor.organizationId))
      : and(eq(apartments.hotelId, hotelId), eq(apartments.organizationId, actor.organizationId)),
    with: { managerAssignments: { with: { manager: { columns: { id: true, name: true } } } }, type: true }
  })
    .then(rows => actor.roles.includes('administrator')
      ? rows.map(serializeApartment)
      : rows.filter(apartment => apartment.managerAssignments.some(assignment => assignment.userId === actor.id)).map(serializeApartment))
}
