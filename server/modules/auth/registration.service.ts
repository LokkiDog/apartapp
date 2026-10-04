import { createHash, randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { organizations, users, pendingRegistrations, systemSettings, registrationAttempts, platformAuditLogs } from '../../infrastructure/database/schema'
import { sendRegistrationLink } from '../../infrastructure/mail/send'
import { ensureEmailAvailable, lockEmail, normalizeEmail, type Connection } from './email-reservation'
import type { z } from 'zod'
import type { registrationInputSchema } from '../../../shared/contracts/platform'

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const expiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000)
export async function registrationMode() {
  return (await db.query.systemSettings.findFirst({ where: eq(systemSettings.id, 'platform') }))?.registrationMode ?? 'superuser_only'
}
async function requireSelfService(tx: Connection) {
  // Serialize confirmation and mode changes, so disabled registrations cannot commit.
  const [settings] = await tx.select().from(systemSettings).where(eq(systemSettings.id, 'platform')).for('share')
  if (settings?.registrationMode !== 'self_service') throw createError({ statusCode: 403, statusMessage: 'Регистрация закрыта' })
}
export async function limitRegistration(key: string) {
  const [attempt] = await db.insert(registrationAttempts).values({ key, count: 1, resetsAt: new Date(Date.now() + 60 * 60 * 1000) })
    .onConflictDoUpdate({ target: registrationAttempts.key, set: {
      count: sql`CASE WHEN ${registrationAttempts.resetsAt} <= now() THEN 1 ELSE ${registrationAttempts.count} + 1 END`,
      resetsAt: sql`CASE WHEN ${registrationAttempts.resetsAt} <= now() THEN now() + interval '1 hour' ELSE ${registrationAttempts.resetsAt} END`
    } }).returning()
  if (!attempt || attempt.count > 10) throw createError({ statusCode: 429, statusMessage: 'Слишком много попыток. Попробуйте позже' })
}
export async function registerCompany(input: z.infer<typeof registrationInputSchema>) {
  const email = normalizeEmail(input.email)
  const token = randomBytes(32).toString('base64url')
  const passwordHash = await hashPassword(input.password)
  await db.transaction(async tx => {
    await requireSelfService(tx)
    await lockEmail(tx, email)
    await ensureEmailAvailable(tx, email)
    await tx.insert(pendingRegistrations).values({ email, companyName: input.companyName, name: input.name, passwordHash, tokenHash: tokenHash(token), expiresAt: expiry() })
  })
  await sendRegistrationLink({ to: email, name: input.name, token })
  return { ok: true }
}
export async function resendRegistration(emailValue: string) {
  const email = normalizeEmail(emailValue)
  const token = randomBytes(32).toString('base64url')
  const pending = await db.transaction(async tx => {
    await requireSelfService(tx)
    await lockEmail(tx, email)
    const pending = await tx.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) })
    if (!pending) return null
    if (Date.now() - pending.sentAt.getTime() < 60_000) throw createError({ statusCode: 429, statusMessage: 'Повторная отправка доступна через минуту' })
    await tx.update(pendingRegistrations).set({ tokenHash: tokenHash(token), expiresAt: expiry(), sentAt: new Date() }).where(eq(pendingRegistrations.id, pending.id))
    return pending
  })
  if (pending) await sendRegistrationLink({ to: email, name: pending.name, token })
  return { ok: true }
}
export async function confirmRegistration(token: string) {
  return db.transaction(async tx => {
    await requireSelfService(tx)
    const pending = await tx.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.tokenHash, tokenHash(token)) })
    if (!pending || pending.expiresAt <= new Date()) throw createError({ statusCode: 400, statusMessage: 'Ссылка недействительна или истекла' })
    await lockEmail(tx, pending.email)
    await ensureEmailAvailable(tx, pending.email, true)
    const [claimed] = await tx.delete(pendingRegistrations).where(and(eq(pendingRegistrations.id, pending.id), eq(pendingRegistrations.tokenHash, tokenHash(token)))).returning()
    if (!claimed) throw createError({ statusCode: 400, statusMessage: 'Ссылка уже использована' })
    const [client] = await tx.insert(organizations).values({ name: pending.companyName }).returning()
    if (!client) throw new Error('Client creation failed')
    const [user] = await tx.insert(users).values({ organizationId: client.id, email: pending.email, name: pending.name, passwordHash: pending.passwordHash, roles: ['administrator'], status: 'active' }).returning()
    if (!user) throw new Error('Administrator creation failed')
    await tx.insert(platformAuditLogs).values({ actorId: user.id, organizationId: client.id, action: 'client.registered' })
    return { ok: true }
  })
}
