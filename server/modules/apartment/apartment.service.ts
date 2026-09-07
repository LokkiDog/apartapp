import { and, asc, eq, gte, inArray, or } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { apartmentInputSchema, apartmentTypeInputSchema, apartmentUpdateSchema, isApartmentOwnerEligible } from '@contracts/crm'
import { canManageApartment, managedApartmentIds, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartmentConsumables, apartmentManagers, apartmentTypeConsumableWriteOffs, apartmentTypes, apartments, attachments, cleaningAssignments, cleaningProblems, cleanings, consumables, financialEntries, hotels, inventoryLots, inventoryMovements, stays, tasks, users, type ChecklistItem, type CleaningTariff } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { serializeApartment } from './apartment-view'
import { buildCleaningChecklist, isUntouchedChecklistTemplate, sofiaToday } from '../cleaning/checklist-template'

function validateTariff(data: { ownerTotalEur: number, cleanerPoolEur: number, laundryEur: number, serviceEur: number }) {
  const components = new Decimal(data.cleanerPoolEur).plus(data.laundryEur).plus(data.serviceEur)
  if (!new Decimal(data.ownerTotalEur).equals(components)) {
    throw createError({ statusCode: 400, statusMessage: 'Сумма компонентов тарифа неверна' })
  }
}

function validateCombinedChecklist(defaultChecklist: readonly string[], additionalChecklist: readonly string[]) {
  if (defaultChecklist.length + additionalChecklist.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'В итоговом чек-листе может быть не более 200 пунктов' })
  }
}

export async function createApartmentType(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = apartmentTypeInputSchema.parse(input)
  const { autoWriteOffs, ...typeData } = data
  const [type] = await db.transaction(async tx => {
    const [created] = await tx.insert(apartmentTypes).values({ organizationId: actor.organizationId, ...typeData }).returning()
    if (created) await replaceApartmentTypeWriteOffs(tx, actor.organizationId, created.id, autoWriteOffs)
    return [created]
  })
  return type
}

export async function listApartmentTypes(actor: Actor) {
  const types = await db.query.apartmentTypes.findMany({ where: eq(apartmentTypes.organizationId, actor.organizationId), with: { autoWriteOffs: true }, orderBy: (types, { asc }) => [asc(types.name)] })
  return types.map(type => ({ ...type, autoWriteOffs: type.autoWriteOffs.map(rule => ({ consumableId: rule.consumableId, quantity: Number(rule.quantity) })) }))
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
  const { autoWriteOffs, ...typeData } = data
  const existing = await db.query.apartmentTypes.findFirst({
    where: and(eq(apartmentTypes.id, apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId))
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Тип апартамента не найден' })
  const [updated] = await db.transaction(async tx => {
    const [saved] = await tx.update(apartmentTypes)
      .set({ ...typeData, updatedAt: new Date() })
      .where(and(eq(apartmentTypes.id, apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId)))
      .returning()
    if (saved) {
      await replaceApartmentTypeWriteOffs(tx, actor.organizationId, apartmentTypeId, autoWriteOffs)
      if (JSON.stringify(existing.defaultChecklist) !== JSON.stringify(saved.defaultChecklist)) {
        const linkedApartments = await tx.query.apartments.findMany({
          where: and(eq(apartments.organizationId, actor.organizationId), eq(apartments.apartmentTypeId, apartmentTypeId))
        })
        await Promise.all(linkedApartments.map(async apartment => {
          validateCombinedChecklist(saved.defaultChecklist, apartment.additionalChecklist)
          await syncFutureTemplateCleanings(
            tx,
            actor.organizationId,
            apartment.id,
            buildCleaningChecklist(existing.defaultChecklist, apartment.additionalChecklist),
            buildCleaningChecklist(saved.defaultChecklist, apartment.additionalChecklist)
          )
        }))
      }
    }
    return [saved]
  })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Тип апартамента не найден' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'apartment_type.updated', entityType: 'apartment_type', entityId: apartmentTypeId })
  return updated
}

async function replaceApartmentTypeWriteOffs(tx: any, organizationId: string, apartmentTypeId: string, rules: Array<{ consumableId: string, quantity: number }>) {
  if (rules.length) {
    const existing = await tx.query.consumables.findMany({ where: and(eq(consumables.organizationId, organizationId), inArray(consumables.id, rules.map(rule => rule.consumableId))) })
    if (existing.length !== rules.length) throw createError({ statusCode: 400, statusMessage: 'Выберите расходники своей организации' })
  }
  await tx.delete(apartmentTypeConsumableWriteOffs).where(and(eq(apartmentTypeConsumableWriteOffs.organizationId, organizationId), eq(apartmentTypeConsumableWriteOffs.apartmentTypeId, apartmentTypeId)))
  if (rules.length) await tx.insert(apartmentTypeConsumableWriteOffs).values(rules.map(rule => ({ organizationId, apartmentTypeId, consumableId: rule.consumableId, quantity: String(rule.quantity) })))
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
  if (!rows.length) return []

  const photoRows = await db.select({ id: attachments.id, entityId: attachments.entityId, fileName: attachments.fileName })
    .from(attachments)
    .where(and(
      eq(attachments.organizationId, actor.organizationId),
      eq(attachments.entityType, 'apartment'),
      inArray(attachments.entityId, rows.map(row => row.id))
    ))
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
  const photosByApartment = new Map<string, Array<{ id: string, fileName: string }>>()
  for (const photo of photoRows) {
    const photos = photosByApartment.get(photo.entityId) ?? []
    photos.push({ id: photo.id, fileName: photo.fileName })
    photosByApartment.set(photo.entityId, photos)
  }

  return rows.map(row => {
    const photos = photosByApartment.get(row.id) ?? []
    return { ...serializeApartment(row), photo: photos[0] ?? null, photos }
  })
}

async function validateManagers(actor: Actor, managerIds: string[]) {
  if (!managerIds.length) return
  const managers = await db.query.users.findMany({
    where: and(inArray(users.id, managerIds), eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))
  })
  if (managers.length !== managerIds.length || managers.some(manager => !isApartmentOwnerEligible(manager.roles))) {
    throw createError({ statusCode: 400, statusMessage: 'Выберите активных собственников' })
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
  validateCombinedChecklist(type.defaultChecklist, data.additionalChecklist)
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
  const existing = await db.query.apartments.findFirst({
    where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)),
    with: { type: true }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  if (data.hotelId && data.hotelId !== existing.hotelId) {
    const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.id, data.hotelId), eq(hotels.organizationId, actor.organizationId), eq(hotels.status, 'active')) })
    if (!hotel) throw createError({ statusCode: 400, statusMessage: 'Нельзя перенести апартамент в неактивный отель' })
  }
  if (managerIds !== undefined) await validateManagers(actor, managerIds)
  const nextType = data.apartmentTypeId
    ? await db.query.apartmentTypes.findFirst({ where: and(eq(apartmentTypes.id, data.apartmentTypeId), eq(apartmentTypes.organizationId, actor.organizationId)) })
    : existing.type
  if (!nextType) throw createError({ statusCode: 400, statusMessage: 'Тип апартамента не найден' })
  validateCombinedChecklist(nextType.defaultChecklist, data.additionalChecklist ?? existing.additionalChecklist)
  if (data.tariffOverride) validateTariff(data.tariffOverride)
  const updated = await db.transaction(async tx => {
    const [changed] = await tx.update(apartments).set({ ...apartmentData, updatedAt: new Date() }).where(eq(apartments.id, apartmentId)).returning()
    if (managerIds !== undefined) await replaceApartmentManagers(tx, actor.organizationId, apartmentId, managerIds)
    if (changed) {
      const previousTemplate = buildCleaningChecklist(existing.type.defaultChecklist, existing.additionalChecklist)
      const nextTemplate = buildCleaningChecklist(nextType.defaultChecklist, changed.additionalChecklist)
      if (JSON.stringify(previousTemplate) !== JSON.stringify(nextTemplate)) {
        await syncFutureTemplateCleanings(tx, actor.organizationId, apartmentId, previousTemplate, nextTemplate)
      }
    }
    return changed
  })
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Не удалось обновить апартамент' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: data.hotelId !== existing.hotelId ? 'apartment.hotel_changed' : 'apartment.updated', entityType: 'apartment', entityId: apartmentId, payload: { before: { hotelId: existing.hotelId }, after: data } })
  return getApartment(actor, updated.id)
}

async function syncFutureTemplateCleanings(
  tx: any,
  organizationId: string,
  apartmentId: string,
  previousTemplate: ReturnType<typeof buildCleaningChecklist>,
  nextTemplate: ReturnType<typeof buildCleaningChecklist>
) {
  const candidates = await tx.query.cleanings.findMany({
    where: and(
      eq(cleanings.organizationId, organizationId),
      eq(cleanings.apartmentId, apartmentId),
      inArray(cleanings.status, ['unassigned', 'assigned']),
      gte(cleanings.scheduledOn, sofiaToday())
    )
  }) as Array<{ id: string, checklist: ChecklistItem[] }>
  await Promise.all(candidates
    .filter(cleaning => isUntouchedChecklistTemplate(cleaning.checklist, previousTemplate))
    .map(cleaning => tx.update(cleanings)
      .set({ checklist: nextTemplate.map(item => ({ ...item })), updatedAt: new Date() })
      .where(and(eq(cleanings.id, cleaning.id), eq(cleanings.organizationId, organizationId))))
  )
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
  const problemRows = await tx.select({ id: cleaningProblems.id }).from(cleaningProblems).where(eq(cleaningProblems.apartmentId, apartmentId))
  if (problemRows.length) attachmentConditions.push(and(eq(attachments.entityType, 'cleaning_problem'), inArray(attachments.entityId, problemRows.map((row: { id: string }) => row.id))))
  if (taskRows.length) attachmentConditions.push(and(eq(attachments.entityType, 'task'), inArray(attachments.entityId, taskRows.map((row: { id: string }) => row.id))))
  const attachmentWhere = attachmentConditions.length === 1 ? attachmentConditions[0]! : or(...attachmentConditions)
  const files = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(attachmentWhere)

  await tx.delete(financialEntries).where(eq(financialEntries.apartmentId, apartmentId))
  await tx.delete(attachments).where(attachmentWhere)
  if (problemRows.length) await tx.delete(cleaningProblems).where(inArray(cleaningProblems.id, problemRows.map((row: { id: string }) => row.id)))
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
