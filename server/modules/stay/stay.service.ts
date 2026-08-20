import { and, eq, inArray, lt, gt, ne } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { stayInputSchema, type StayListQuery } from '@contracts/crm'
import { canManageApartment, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { cleaningAssignments, cleanings, financialEntries, inventoryLots, inventoryMovements, specialServices, stayServices, stays } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry } from '../finance/finance.service'

async function assertNoOverlap(organizationId: string, apartmentId: string, checkInOn: string, checkOutOn: string, exceptId?: string) {
  const criteria = [eq(stays.organizationId, organizationId), eq(stays.apartmentId, apartmentId), lt(stays.checkInOn, checkOutOn), gt(stays.checkOutOn, checkInOn)]
  if (exceptId) criteria.push(ne(stays.id, exceptId))
  const conflict = await db.query.stays.findFirst({ where: and(...criteria) })
  if (conflict) throw createError({ statusCode: 409, statusMessage: 'Заезд пересекается с существующим бронированием' })
}

async function serviceSnapshots(serviceIds: string[], organizationId: string) {
  if (!serviceIds.length) return []
  const services = await db.select().from(specialServices).where(and(eq(specialServices.organizationId, organizationId), inArray(specialServices.id, serviceIds), eq(specialServices.active, true)))
  if (services.length !== serviceIds.length) throw createError({ statusCode: 400, statusMessage: 'Некоторые услуги недоступны' })
  return services
}

export async function listStays(actor: Actor, query: StayListQuery = {}) {
  const criteria = [eq(stays.organizationId, actor.organizationId)]
  if (query.from) criteria.push(gt(stays.checkOutOn, query.from))
  if (query.to) criteria.push(lt(stays.checkInOn, query.to))
  if (query.apartmentIds) criteria.push(inArray(stays.apartmentId, query.apartmentIds))
  const rows = await db.query.stays.findMany({ where: and(...criteria), with: { apartment: { with: { hotel: true, manager: true } }, services: true, cleaning: { columns: { id: true, status: true, scheduledOn: true } } }, orderBy: (stays, { asc }) => [asc(stays.checkInOn)] })
  return rows.filter(stay => (actor.roles.includes('administrator') || stay.apartment.managerId === actor.id) && (!query.hotelId || stay.apartment.hotelId === query.hotelId))
}

export async function createStay(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  const data = stayInputSchema.parse(input)
  if (!(await canManageApartment(actor, data.apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  await assertNoOverlap(actor.organizationId, data.apartmentId, data.checkInOn, data.checkOutOn)
  const services = await serviceSnapshots(data.serviceIds, actor.organizationId)
  const cashAmountEur = data.cashAmountEur ?? Number(services.reduce((sum, service) => sum.plus(service.priceEur), new Decimal(0)).toDecimalPlaces(2))
  const { serviceIds: _serviceIds, ...stayData } = data
  const [stay] = await db.insert(stays).values({ ...stayData, organizationId: actor.organizationId, cashAmountEur, createdById: actor.id }).returning()
  if (!stay) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать заезд' })
  const snapshots = services.length
    ? await db.insert(stayServices).values(services.map(service => ({ stayId: stay.id, specialServiceId: service.id, nameSnapshot: service.name, priceEurSnapshot: service.priceEur, managerSharePercentSnapshot: service.managerSharePercent }))).returning()
    : []
  await Promise.all(snapshots.map(service => createFinancialEntry({ organizationId: actor.organizationId, apartmentId: stay.apartmentId, type: 'guest_service_charge', visibility: 'administrator', amountEur: service.priceEurSnapshot, occurredOn: stay.checkInOn, description: `Допуслуга: ${service.nameSnapshot}`, sourceType: 'stay_service', sourceId: service.id, createdById: actor.id })))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'stay.created', entityType: 'stay', entityId: stay.id })
  if (actor.roles.includes('manager')) await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'stay_changed', title: 'Новый заезд', body: 'Управляющий создал новый заезд', href: `/calendar` })
  return stay
}

export async function updateStay(actor: Actor, stayId: string, input: unknown) {
  const data = stayInputSchema.parse(input)
  const existing = await db.query.stays.findFirst({ where: and(eq(stays.id, stayId), eq(stays.organizationId, actor.organizationId)), with: { services: true } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Заезд не найден' })
  if (!(await canManageApartment(actor, existing.apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к заезду' })
  if (data.apartmentId !== existing.apartmentId) throw createError({ statusCode: 400, statusMessage: 'Апартамент существующего заезда изменить нельзя' })
  await assertNoOverlap(actor.organizationId, existing.apartmentId, data.checkInOn, data.checkOutOn, stayId)
  const requestedServiceIds = new Set(data.serviceIds)
  const existingByServiceId = new Map(existing.services.map(service => [service.specialServiceId, service]))
  const addedServices = await serviceSnapshots(data.serviceIds.filter(serviceId => !existingByServiceId.has(serviceId)), actor.organizationId)
  const retainedServices = existing.services.filter(service => requestedServiceIds.has(service.specialServiceId))
  const selectedServiceTotal = retainedServices.reduce((sum, service) => sum.plus(service.priceEurSnapshot), new Decimal(0))
    .plus(addedServices.reduce((sum, service) => sum.plus(service.priceEur), new Decimal(0)))
  const cashAmountEur = data.cashAmountEur ?? Number(selectedServiceTotal.toDecimalPlaces(2))
  const { serviceIds: _serviceIds, ...stayData } = data
  const removedServices = existing.services.filter(service => !requestedServiceIds.has(service.specialServiceId))

  const updated = await db.transaction(async tx => {
    const [updatedStay] = await tx.update(stays).set({ ...stayData, cashAmountEur, updatedAt: new Date() }).where(eq(stays.id, stayId)).returning()

    if (removedServices.length) {
      const removedIds = removedServices.map(service => service.id)
      await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'stay_service'), inArray(financialEntries.sourceId, removedIds)))
      await tx.delete(stayServices).where(inArray(stayServices.id, removedIds))
    }

    if (retainedServices.length) {
      await tx.update(financialEntries)
        .set({ occurredOn: data.checkInOn })
        .where(and(eq(financialEntries.sourceType, 'stay_service'), inArray(financialEntries.sourceId, retainedServices.map(service => service.id))))
    }

    const addedSnapshots = addedServices.length
      ? await tx.insert(stayServices).values(addedServices.map(service => ({ stayId, specialServiceId: service.id, nameSnapshot: service.name, priceEurSnapshot: service.priceEur, managerSharePercentSnapshot: service.managerSharePercent }))).returning()
      : []
    for (const service of addedSnapshots) {
      await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: existing.apartmentId, type: 'guest_service_charge', visibility: 'administrator', amountEur: service.priceEurSnapshot, occurredOn: data.checkInOn, description: `Допуслуга: ${service.nameSnapshot}`, sourceType: 'stay_service', sourceId: service.id, createdById: actor.id }, tx as unknown as typeof db)
    }
    return updatedStay
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'stay.updated', entityType: 'stay', entityId: stayId })
  if (actor.roles.includes('manager')) await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'stay_changed', title: 'Заезд изменен', body: 'Управляющий изменил заезд', href: '/calendar' })
  return updated
}

export async function deleteStay(actor: Actor, stayId: string) {
  requireRole(actor, 'administrator')
  const stay = await db.query.stays.findFirst({ where: and(eq(stays.id, stayId), eq(stays.organizationId, actor.organizationId)), with: { services: true } })
  if (!stay) throw createError({ statusCode: 404, statusMessage: 'Заезд не найден' })
  await db.transaction(async tx => {
    const cleaning = await tx.query.cleanings.findFirst({ where: eq(cleanings.stayId, stayId) })
    if (cleaning) {
      const usages = await tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.sourceType, 'cleaning'), eq(inventoryMovements.sourceId, cleaning.id), eq(inventoryMovements.type, 'usage')))
      for (const usage of usages) {
        const unitCostEur = Number(new Decimal(usage.totalCostEur).dividedBy(usage.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
        await tx.insert(inventoryLots).values({ apartmentId: usage.apartmentId, consumableId: usage.consumableId, remainingQuantity: usage.quantity, unitCostEur })
      }
      await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'cleaning'), eq(financialEntries.sourceId, cleaning.id)))
      if (usages.length) await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'inventory_movement'), inArray(financialEntries.sourceId, usages.map(usage => usage.id))))
      await tx.delete(inventoryMovements).where(and(eq(inventoryMovements.sourceType, 'cleaning'), eq(inventoryMovements.sourceId, cleaning.id)))
      await tx.delete(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, cleaning.id))
      await tx.delete(cleanings).where(eq(cleanings.id, cleaning.id))
    }
    if (stay.services.length) await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'stay_service'), inArray(financialEntries.sourceId, stay.services.map(service => service.id))))
    await tx.delete(stays).where(eq(stays.id, stayId))
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'stay.deleted', entityType: 'stay', entityId: stayId })
  return { ok: true }
}
