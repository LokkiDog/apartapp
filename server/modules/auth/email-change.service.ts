import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { authTokens, pendingEmailChanges, users } from '../../infrastructure/database/schema'
import { sendNotificationEmail } from '../../infrastructure/mail/send'
import { ensureEmailAvailable, lockEmail, normalizeEmail } from './email-reservation'

const validity = 30 * 60 * 1000

function activeUser(actor: Actor) {
  return and(eq(users.id, actor.id), eq(users.status, 'active'), actor.isSuperuser ? undefined : eq(users.organizationId, actor.organizationId))
}

function digest(userId: string, passwordHash: string, email: string, sentAt: Date, code: string) {
  const secret = useRuntimeConfig().session.password
  if (!secret) throw createError({ statusCode: 500, statusMessage: 'Session secret unavailable' })
  return createHmac('sha256', secret).update(JSON.stringify([userId, passwordHash, email, sentAt.toISOString(), code])).digest('hex')
}

export async function sendEmailChangeCode(actor: Actor, input: { email?: string; currentPassword?: string }) {
  const sessionId = actor.platformSessionId
  if (!sessionId) throw createError({ statusCode: 401 })
  const account = await db.query.users.findFirst({ where: activeUser(actor) })
  if (!account) throw createError({ statusCode: 401 })
  if (input.email && (!input.currentPassword || !await verifyPassword(account.passwordHash, input.currentPassword))) {
    throw createError({ statusCode: 400, data: { code: 'INCORRECT_PASSWORD' } })
  }

  const record = await db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(activeUser(actor)).for('update')
    if (!user || user.passwordHash !== account.passwordHash || user.email !== account.email) throw createError({ statusCode: 409 })
    const previous = await tx.query.pendingEmailChanges.findFirst({ where: eq(pendingEmailChanges.userId, user.id) })
    const now = new Date()
    if (previous && now.getTime() - previous.sentAt.getTime() < 60_000) throw createError({ statusCode: 429 })
    if (!input.email && (!previous || previous.sessionId !== sessionId || previous.expiresAt <= now)) {
      throw createError({ statusCode: 400, data: { code: 'CODE_EXPIRED' } })
    }
    const email = normalizeEmail(input.email ?? previous!.email)
    if (email === normalizeEmail(user.email)) throw createError({ statusCode: 400, data: { code: 'SAME_EMAIL' } })
    await lockEmail(tx, email)
    await ensureEmailAvailable(tx, email)
    const sentAt = new Date()
    let code: string
    do { code = String(randomInt(1_000_000)).padStart(6, '0') }
    while (previous && digest(user.id, user.passwordHash, previous.email, previous.sentAt, code) === previous.codeHash)
    const next = { sessionId, email, sentAt, expiresAt: new Date(sentAt.getTime() + validity),
      codeHash: digest(user.id, user.passwordHash, email, sentAt, code) }
    await tx.insert(pendingEmailChanges).values({ ...next, userId: user.id })
      .onConflictDoUpdate({ target: pendingEmailChanges.userId, set: { ...next, attempts: 0 } })
    return { ...next, code }
  })

  const copy = emailChangeCopy[account.locale]
  try {
    await sendNotificationEmail({ to: record.email, name: account.name, subject: copy.subject, text: copy.code(record.code) })
  } catch {
    await db.delete(pendingEmailChanges).where(and(eq(pendingEmailChanges.userId, account.id), eq(pendingEmailChanges.codeHash, record.codeHash)))
    throw createError({ statusCode: 502, data: { code: 'MAIL_FAILED' } })
  }
  return { email: record.email }
}

export async function confirmEmailChange(actor: Actor, code: string) {
  const result = await db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(activeUser(actor)).for('update')
    if (!user) throw createError({ statusCode: 401 })
    const where = eq(pendingEmailChanges.userId, user.id)
    const request = await tx.query.pendingEmailChanges.findFirst({ where })
    if (!request || request.sessionId !== actor.platformSessionId || request.expiresAt <= new Date()) return null
    const actual = digest(user.id, user.passwordHash, request.email, request.sentAt, code)
    if (!timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(request.codeHash, 'hex'))) {
      if (request.attempts >= 4) await tx.delete(pendingEmailChanges).where(where)
      else await tx.update(pendingEmailChanges).set({ attempts: request.attempts + 1 }).where(where)
      return false
    }
    await lockEmail(tx, request.email)
    await ensureEmailAvailable(tx, request.email)
    if (request.expiresAt <= new Date()) return null
    await tx.update(users).set({ email: request.email, updatedAt: new Date() }).where(activeUser(actor))
    await tx.delete(pendingEmailChanges).where(where)
    await tx.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.type, 'password_reset')))
    return { email: request.email, previousEmail: user.email, name: user.name, locale: user.locale }
  })
  if (result === false) throw createError({ statusCode: 400, data: { code: 'INVALID_CODE' } })
  if (result === null) throw createError({ statusCode: 400, data: { code: 'CODE_EXPIRED' } })
  const copy = emailChangeCopy[result.locale]
  await sendNotificationEmail({ to: result.previousEmail, name: result.name, subject: copy.subject, text: copy.changed })
    .catch(() => console.error('Account email change notification failed'))
  return { email: result.email }
}

const emailChangeCopy = {
  ru: { subject: 'Смена email', code: (code: string) => `Код для смены email: ${code}. Он действует 30 минут.`, changed: 'Адрес для входа в ваш аккаунт изменён. Если это сделали не вы, обратитесь в поддержку.' },
  en: { subject: 'Change your email', code: (code: string) => `Your email change code is ${code}. It expires in 30 minutes.`, changed: 'Your sign-in email changed. If you did not make this change, contact support.' },
  he: { subject: 'שינוי כתובת אימייל', code: (code: string) => `קוד לאימות כתובת האימייל: ${code}. הקוד תקף ל-30 דקות.`, changed: 'כתובת האימייל לכניסה לחשבון השתנתה. אם לא ביצעתם את השינוי, פנו לתמיכה.' }
}
