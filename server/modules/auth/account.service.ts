import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Actor } from '../../infrastructure/auth/actor'
import { requireRole } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartmentManagers, attachments, authTokens, cleaningAssignments, cleanings, financialEntries, inventoryLots, inventoryMovements, notifications, stays, stayServices, tasks, users } from '../../infrastructure/database/schema'
import { sendAccountLink } from '../../infrastructure/mail/send'
import { fileStorage } from '../../infrastructure/storage/local'
import { publishNotification } from '../../infrastructure/notification/realtime'
import { invitationResendAvailableAt, invitationResendWaitSeconds } from './invitation-cooldown'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const expiry = () => new Date(Date.now() + 1000 * 60 * 60 * 24)

async function issueToken(userId: string, type: 'invitation' | 'password_reset') {
  const token = randomBytes(32).toString('base64url')
  await db.insert(authTokens).values({ userId, type, tokenHash: hash(token), expiresAt: expiry() })
  return token
}

export async function inviteUser(input: { organizationId: string; name: string; email: string; roles: Array<'administrator' | 'manager' | 'cleaner'>; locale?: 'ru' | 'en' | 'he' }) {
  const email = input.email.toLowerCase()
  const existing = await db.query.users.findFirst({ where: and(eq(users.organizationId, input.organizationId), eq(users.email, email)) })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Пользователь с этим email уже существует' })
  const [user] = await db.insert(users).values({ organizationId: input.organizationId, name: input.name, email, roles: input.roles, locale: input.locale ?? 'ru', passwordHash: await hashPassword(randomBytes(32).toString('hex')), status: 'invited' }).returning()
  if (!user) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать приглашение' })
  const token = await issueToken(user.id, 'invitation')
  await sendAccountLink({ to: user.email, name: user.name, type: 'invitation', token, locale: user.locale })
  return { id: user.id, email: user.email }
}

export async function resendInvitation(actor: Actor, userId: string) {
  requireRole(actor, 'administrator')
  const token = randomBytes(32).toString('base64url')
  const issued = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const user = await tx.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.organizationId, actor.organizationId)) })
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
    if (user.status !== 'invited') throw createError({ statusCode: 409, statusMessage: 'Повторно отправить приглашение можно только приглашённому пользователю' })

    const latestInvitation = await tx.query.authTokens.findFirst({
      where: and(eq(authTokens.userId, user.id), eq(authTokens.type, 'invitation')),
      orderBy: (tokens, { desc }) => [desc(tokens.createdAt)]
    })
    if (latestInvitation && invitationResendWaitSeconds(latestInvitation.createdAt) > 0) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Повторное приглашение пока недоступно',
        data: { invitationResendAvailableAt: invitationResendAvailableAt(latestInvitation.createdAt).toISOString() }
      })
    }

    const [tokenRecord] = await tx.insert(authTokens).values({ userId: user.id, type: 'invitation', tokenHash: hash(token), expiresAt: expiry() }).returning()
    if (!tokenRecord) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать приглашение' })
    return { user, tokenRecord }
  })

  try {
    await sendAccountLink({ to: issued.user.email, name: issued.user.name, type: 'invitation', token, locale: issued.user.locale })
  } catch (cause) {
    await db.delete(authTokens).where(eq(authTokens.id, issued.tokenRecord.id))
    throw cause
  }

  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'user.invitation_resent', entityType: 'user', entityId: userId })
  return { ok: true, invitationResendAvailableAt: invitationResendAvailableAt(issued.tokenRecord.createdAt).toISOString() }
}

export async function requestPasswordReset(email: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) })
  if (!user || user.status !== 'active') return
  const token = await issueToken(user.id, 'password_reset')
  await sendAccountLink({ to: user.email, name: user.name, type: 'password_reset', token, locale: user.locale })
}

export async function setPassword(token: string, password: string) {
  const record = await db.query.authTokens.findFirst({ where: and(eq(authTokens.tokenHash, hash(token)), gt(authTokens.expiresAt, new Date()), isNull(authTokens.usedAt)) })
  if (!record) throw createError({ statusCode: 400, statusMessage: 'Ссылка недействительна или истекла' })
  await db.transaction(async tx => {
    const [usedToken] = await tx.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.id, record.id), isNull(authTokens.usedAt))).returning()
    if (!usedToken) throw createError({ statusCode: 400, statusMessage: 'Ссылка недействительна или истекла' })
    const expectedStatus = usedToken.type === 'invitation' ? 'invited' : 'active'
    const [user] = await tx.update(users).set({ passwordHash: await hashPassword(password), status: 'active', updatedAt: new Date() }).where(and(eq(users.id, usedToken.userId), eq(users.status, expectedStatus))).returning()
    if (!user) throw createError({ statusCode: 400, statusMessage: 'Ссылка недействительна или истекла' })
  })
}

async function ensureUserCanBeRemoved(actor: Actor, userId: string) {
  requireRole(actor, 'administrator')
  if (actor.id === userId) throw createError({ statusCode: 409, statusMessage: 'Нельзя удалить собственную учетную запись' })
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.organizationId, actor.organizationId)) })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  if (user.status === 'active' && user.roles.includes('administrator')) {
    const activeUsers = await db.query.users.findMany({ where: and(eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
    if (activeUsers.filter(candidate => candidate.roles.includes('administrator')).length < 2) throw createError({ statusCode: 409, statusMessage: 'Нельзя удалить или архивировать последнего активного администратора' })
  }
  return user
}

async function deleteWorkRecords(tx: any, cleaningIds: string[], taskIds: string[]) {
  const attachmentConditions = [] as any[]
  if (cleaningIds.length) attachmentConditions.push(and(eq(attachments.entityType, 'cleaning'), inArray(attachments.entityId, cleaningIds)))
  if (taskIds.length) attachmentConditions.push(and(eq(attachments.entityType, 'task'), inArray(attachments.entityId, taskIds)))
  const files = attachmentConditions.length ? await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(attachmentConditions.length === 1 ? attachmentConditions[0] : or(...attachmentConditions)) : []
  const movementConditions = [] as any[]
  if (cleaningIds.length) movementConditions.push(and(eq(inventoryMovements.sourceType, 'cleaning'), inArray(inventoryMovements.sourceId, cleaningIds)))
  if (taskIds.length) movementConditions.push(and(eq(inventoryMovements.sourceType, 'task'), inArray(inventoryMovements.sourceId, taskIds)))
  const movements = movementConditions.length ? await tx.select().from(inventoryMovements).where(movementConditions.length === 1 ? movementConditions[0] : or(...movementConditions)) : []
  for (const movement of movements.filter((movement: { type: string }) => movement.type === 'usage')) {
    await tx.insert(inventoryLots).values({ apartmentId: movement.apartmentId, consumableId: movement.consumableId, remainingQuantity: movement.quantity, unitCostEur: movement.quantity === '0' ? 0 : Number(movement.totalCostEur) / Number(movement.quantity) })
  }
  const financeConditions = [] as any[]
  if (cleaningIds.length) financeConditions.push(and(eq(financialEntries.sourceType, 'cleaning'), inArray(financialEntries.sourceId, cleaningIds)))
  if (taskIds.length) financeConditions.push(and(eq(financialEntries.sourceType, 'task'), inArray(financialEntries.sourceId, taskIds)))
  if (movements.length) financeConditions.push(and(eq(financialEntries.sourceType, 'inventory_movement'), inArray(financialEntries.sourceId, movements.map((movement: { id: string }) => movement.id))))
  if (financeConditions.length) await tx.delete(financialEntries).where(financeConditions.length === 1 ? financeConditions[0] : or(...financeConditions))
  if (attachmentConditions.length) await tx.delete(attachments).where(attachmentConditions.length === 1 ? attachmentConditions[0] : or(...attachmentConditions))
  if (movements.length) await tx.delete(inventoryMovements).where(inArray(inventoryMovements.id, movements.map((movement: { id: string }) => movement.id)))
  if (cleaningIds.length) await tx.delete(cleaningAssignments).where(inArray(cleaningAssignments.cleaningId, cleaningIds))
  if (cleaningIds.length) await tx.delete(cleanings).where(inArray(cleanings.id, cleaningIds))
  if (taskIds.length) await tx.delete(tasks).where(inArray(tasks.id, taskIds))
  return files.map((file: { storageKey: string }) => file.storageKey)
}

async function deleteAssignedWork(tx: any, userId: string) {
  const [assignedCleanings, userTasks] = await Promise.all([
    tx.select({ id: cleaningAssignments.cleaningId }).from(cleaningAssignments).where(eq(cleaningAssignments.cleanerId, userId)),
    tx.select({ id: tasks.id }).from(tasks).where(or(eq(tasks.createdById, userId), eq(tasks.assigneeId, userId)))
  ])
  return deleteWorkRecords(tx, assignedCleanings.map((row: { id: string }) => row.id), userTasks.map((row: { id: string }) => row.id))
}

export async function archiveUser(actor: Actor, userId: string) {
  const user = await ensureUserCanBeRemoved(actor, userId)
  if (user.status === 'archived') return { ok: true }
  await db.transaction(async tx => {
    await tx.delete(authTokens).where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt)))
    await tx.update(users).set({ status: 'archived', updatedAt: new Date() }).where(eq(users.id, userId))
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'user.archived', entityType: 'user', entityId: userId })
  publishNotification(userId, { type: 'session.revoked', reason: 'archived' })
  return { ok: true }
}

export async function restoreUser(actor: Actor, userId: string) {
  requireRole(actor, 'administrator')
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.organizationId, actor.organizationId)) })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  if (user.status !== 'archived') throw createError({ statusCode: 409, statusMessage: 'Вернуть можно только архивированного пользователя' })
  await db.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, userId))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'user.restored', entityType: 'user', entityId: userId })
  return { ok: true }
}

export async function deleteUserPermanently(actor: Actor, userId: string, confirmationName: string) {
  const user = await ensureUserCanBeRemoved(actor, userId)
  if (user.status !== 'archived') throw createError({ statusCode: 409, statusMessage: 'Сначала архивируйте пользователя' })
  if (confirmationName.trim() !== user.name) throw createError({ statusCode: 400, statusMessage: 'Введите имя пользователя точно так, как оно указано' })
  const storageKeys = await db.transaction(async tx => {
    const files = await deleteAssignedWork(tx, userId)
    const authoredStays = await tx.select({ id: stays.id }).from(stays).where(eq(stays.createdById, userId))
    const stayIds = authoredStays.map((stay: { id: string }) => stay.id)
    if (stayIds.length) {
      const stayCleaningRows = await tx.select({ id: cleanings.id }).from(cleanings).where(inArray(cleanings.stayId, stayIds))
      files.push(...await deleteWorkRecords(tx, stayCleaningRows.map((row: { id: string }) => row.id), []))
      const selectedServices = await tx.select({ id: stayServices.id }).from(stayServices).where(inArray(stayServices.stayId, stayIds))
      if (selectedServices.length) await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'stay_service'), inArray(financialEntries.sourceId, selectedServices.map((row: { id: string }) => row.id))))
      await tx.delete(stays).where(inArray(stays.id, stayIds))
    }
    const uploadedFiles = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(eq(attachments.uploadedById, userId))
    if (uploadedFiles.length) await tx.delete(attachments).where(eq(attachments.uploadedById, userId))
    files.push(...uploadedFiles.map((file: { storageKey: string }) => file.storageKey))
    const authoredMovements = await tx.select({ id: inventoryMovements.id }).from(inventoryMovements).where(eq(inventoryMovements.createdById, userId))
    if (authoredMovements.length) {
      await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'inventory_movement'), inArray(financialEntries.sourceId, authoredMovements.map((row: { id: string }) => row.id))))
      await tx.delete(inventoryMovements).where(inArray(inventoryMovements.id, authoredMovements.map((row: { id: string }) => row.id)))
    }
    await tx.delete(financialEntries).where(eq(financialEntries.createdById, userId))
    await tx.delete(apartmentManagers).where(eq(apartmentManagers.userId, userId))
    await tx.delete(notifications).where(eq(notifications.userId, userId))
    await tx.update(users).set({ status: 'archived' }).where(eq(users.id, userId))
    await tx.delete(users).where(eq(users.id, userId))
    return files
  })
  await Promise.allSettled(storageKeys.map((storageKey: string) => fileStorage.remove(storageKey)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'user.deleted', entityType: 'user', entityId: userId })
  return { ok: true }
}
