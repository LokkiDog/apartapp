import { and, eq, inArray, or } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { apartmentInputSchema, apartmentTypeInputSchema, apartmentUpdateSchema } from '@contracts/crm'
import { canManageApartment, managedApartmentIds, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartmentConsumables, apartmentManagers, apartmentTypes, apartments, attachments, cleaningAssignments, cleanings, financialEntries, hotels, inventoryLots, inventoryMovements, stays, tasks, users, type CleaningTariff } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { serializeApartment } from './apartment-view'

function validateTariff(data: { ownerTotalEur: number, cleanerPoolEur: number, laundryEur: number, serviceEur: number }) {
  const components = new Decimal(data.cleanerPoolEur).plus(data.laundryEur).plus(data.serviceEur)
  if (!new Decimal(data.ownerTotalEur).equals(components)) {
    throw createError({ statusCode: 400, statusMessage: 'Сумма компонентов тарифа неверна' })
  }
}

export async function createApartmentType(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = apartmentTypeInputSchema.parse(input)
  const [type] = await db.insert(apartmentTypes).values({ organizationId: actor.organizationId, ...data }).returning()
  return type
}

export async function listApartmentTypes(actor: Actor) {
  return db.query.apartmentTypes.findMany({ where: eq(apartmentTypes.organizationId, actor.organizationId), orderBy: (types, { asc }) => [asc(types.name)] })
}

export async function deleteApartmentType(actor: Actor, apartmentTypeId: string) {
  requireRole(actor, 'administrator')
  const type = await db.query.apartmentTypes.findFirst({
    where: and(eq(apartmentTypes.id, apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId))
  })
  if (!type) throw createError({ statusCode: 404, statusMessage: 'Тип апартамента не найден' })

  const storageKeys = await db.transaction(async tx => {
    const linkedApartments = await tx
      .select({ id: apartments.id })
      .from(apartments)
      .where(and(eq(apartments.organizationId, actor.organizationId), eq(apartments.apartmentTypeId, apartmentTypeId)))

    const keys = (await Promise.all(linkedApartments.map(({ id }: { id: string }) => deleteApartmentRecords(tx, id)))).flat()
    await tx.delete(apartmentTypes).where(eq(apartmentTypes.id, apartmentTypeId))
    return keys
  })

  await Promise.allSettled(storageKeys.map((storageKey: string) => fileStorage.remove(storageKey)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'apartment_type.deleted', entityType: 'apartment_type', entityId: apartmentTypeId })
  return { ok: true }
}

export async function updateApartmentType(actor: Actor, apartmentTypeId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = apartmentTypeInputSchema.parse(input)
  const [updated] = await db.update(apartmentTypes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(apartmentTypes.id, apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId)))
    .returning()
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Тип апартамента не найден' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'apartment_type.updated', entityType: 'apartment_type', entityId: apartmentTypeId })
  return updated
}

export async function listApartments(actor: Actor, hotelId?: string) {
  const criteria = [eq(apartments.organizationId, actor.organizationId)]
  if (hotelId) criteria.push(eq(apartments.hotelId, hotelId))
  const managedIds = await managedApartmentIds(actor)
  if (managedIds && !managedIds.length) return []
  if (managedIds) criteria.push(inArray(apartments.id, managedIds))
  const rows = await db.query.apartments.findMany({
    where: and(...criteria),
    with: { hotel: true, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } }, type: true },
    orderBy: (apartments, { asc }) => [asc(apartments.name)]
  })
  return rows.map(serializeApartment)
}

async function validateManagers(actor: Actor, managerIds: string[]) {
  if (!managerIds.length) return
  const managers = await db.query.users.findMany({
    where: and(inArray(users.id, managerIds), eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))
  })
  if (managers.length !== managerIds.length || managers.some(manager => !manager.roles.includes('manager'))) {
    throw createError({ statusCode: 400, statusMessage: 'Выберите активных управляющих' })
  }
}

async function replaceApartmentManagers(tx: any, organizationId: string, apartmentId: string, managerIds: string[]) {
  await tx.delete(apartmentManagers).where(eq(apartmentManagers.apartmentId, apartmentId))
  if (managerIds.length) await tx.insert(apartmentManagers).values(managerIds.map(userId => ({ organizationId, apartmentId, userId })))
}

export async function createApartment(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = apartmentInputSchema.parse(input)
  const { managerIds, ...apartmentData } = data
  const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.id, data.hotelId), eq(hotels.organizationId, actor.organizationId)) })
  if (!hotel || hotel.status !== 'active') throw createError({ statusCode: 400, statusMessage: 'Выберите активный отель' })
  await validateManagers(actor, managerIds)
  const type = await db.query.apartmentTypes.findFirst({ where: and(eq(apartmentTypes.id, data.apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId)) })
  if (!type) throw createError({ statusCode: 400, statusMessage: 'Тип апартамента не найден' })
  if (data.tariffOverride) validateTariff(data.tariffOverride)
  const apartment = await db.transaction(async tx => {
    const [created] = await tx.insert(apartments).values({ ...apartmentData, organizationId: actor.organizationId, tariffOverride: apartmentData.tariffOverride ?? null }).returning()
    if (!created) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать апартамент' })
    await replaceApartmentManagers(tx, actor.organizationId, created.id, managerIds)
    return created
  })
  if (!apartment) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать апартамент' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'apartment.created', entityType: 'apartment', entityId: apartment.id, payload: { hotelId: data.hotelId } })
  return getApartment(actor, apartment.id)
}

export async function getApartment(actor: Actor, apartmentId: string) {
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)), with: { hotel: true, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } }, type: true } })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  if (!(await canManageApartment(actor, apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  return serializeApartment(apartment)
}

export async function updateApartment(actor: Actor, apartmentId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = apartmentUpdateSchema.parse(input)
  const { managerIds, ...apartmentData } = data
  const existing = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  if (data.hotelId && data.hotelId !== existing.hotelId) {
    const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.id, data.hotelId), eq(hotels.organizationId, actor.organizationId), eq(hotels.status, 'active')) })
    if (!hotel) throw createError({ statusCode: 400, statusMessage: 'Нельзя перенести апартамент в неактивный отель' })
  }
  if (managerIds !== undefined) await validateManagers(actor, managerIds)
  if (data.apartmentTypeId) {
    const type = await db.query.apartmentTypes.findFirst({ where: and(eq(apartmentTypes.id, data.apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId)) })
    if (!type) throw createError({ statusCode: 400, statusMessage: 'Тип апартамента не найден' })
  }
  if (data.tariffOverride) validateTariff(data.tariffOverride)
  const updated = await db.transaction(async tx => {
    const [changed] = await tx.update(apartments).set({ ...apartmentData, updatedAt: new Date() }).where(eq(apartments.id, apartmentId)).returning()
    if (managerIds !== undefined) await replaceApartmentManagers(tx, actor.organizationId, apartmentId, managerIds)
    return changed
  })
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Не удалось обновить апартамент' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: data.hotelId !== existing.hotelId ? 'apartment.hotel_changed' : 'apartment.updated', entityType: 'apartment', entityId: apartmentId, payload: { before: { hotelId: existing.hotelId }, after: data } })
  return getApartment(actor, updated.id)
}

export async function archiveApartment(actor: Actor, apartmentId: string) {
  requireRole(actor, 'administrator')
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  if (apartment.status === 'archived') return apartment
  const [archived] = await db.update(apartments).set({ status: 'archived', updatedAt: new Date() }).where(eq(apartments.id, apartmentId)).returning()
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'apartment.archived', entityType: 'apartment', entityId: apartmentId })
  return archived
}

export async function deleteApartmentRecords(tx: any, apartmentId: string) {
  const [cleaningRows, taskRows] = await Promise.all([
    tx.select({ id: cleanings.id }).from(cleanings).where(eq(cleanings.apartmentId, apartmentId)),
    tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.apartmentId, apartmentId))
  ])
  const attachmentConditions = [and(eq(attachments.entityType, 'apartment'), eq(attachments.entityId, apartmentId))]
  if (cleaningRows.length) attachmentConditions.push(and(eq(attachments.entityType, 'cleaning'), inArray(attachments.entityId, cleaningRows.map((row: { id: string }) => row.id))))
  if (taskRows.length) attachmentConditions.push(and(eq(attachments.entityType, 'task'), inArray(attachments.entityId, taskRows.map((row: { id: string }) => row.id))))
  const attachmentWhere = attachmentConditions.length === 1 ? attachmentConditions[0]! : or(...attachmentConditions)
  const files = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(attachmentWhere)

  await tx.delete(financialEntries).where(eq(financialEntries.apartmentId, apartmentId))
  await tx.delete(attachments).where(attachmentWhere)
  await tx.delete(inventoryMovements).where(eq(inventoryMovements.apartmentId, apartmentId))
  await tx.delete(inventoryLots).where(eq(inventoryLots.apartmentId, apartmentId))
  await tx.delete(apartmentConsumables).where(eq(apartmentConsumables.apartmentId, apartmentId))
  if (cleaningRows.length) await tx.delete(cleaningAssignments).where(inArray(cleaningAssignments.cleaningId, cleaningRows.map((row: { id: string }) => row.id)))
  await tx.delete(cleanings).where(eq(cleanings.apartmentId, apartmentId))
  await tx.delete(tasks).where(eq(tasks.apartmentId, apartmentId))
  await tx.delete(stays).where(eq(stays.apartmentId, apartmentId))
  await tx.delete(apartments).where(eq(apartments.id, apartmentId))
  return files.map((file: { storageKey: string }) => file.storageKey)
}

export async function deleteApartment(actor: Actor, apartmentId: string) {
  requireRole(actor, 'administrator')
  const apartment = await db.query.apartments.findFirst({
    where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId))
  })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })

  const storageKeys = await db.transaction(tx => deleteApartmentRecords(tx, apartmentId))

  await Promise.allSettled(storageKeys.map((storageKey: string) => fileStorage.remove(storageKey)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'apartment.deleted', entityType: 'apartment', entityId: apartmentId })
  return { ok: true }
}

export async function apartmentTariff(apartmentId: string): Promise<CleaningTariff> {
  const apartment = await db.query.apartments.findFirst({ where: eq(apartments.id, apartmentId), with: { type: true } })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment.tariffOverride ?? {
    ownerTotalEur: apartment.type.ownerTotalEur,
    cleanerPoolEur: apartment.type.cleanerPoolEur,
    laundryEur: apartment.type.laundryEur,
    serviceEur: apartment.type.serviceEur
  }
}
