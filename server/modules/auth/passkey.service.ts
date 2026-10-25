import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import { createError, getCookie, setCookie, deleteCookie, getHeader, type H3Event } from 'h3'
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { db } from '../../infrastructure/database/client'
import { users, passkeys, passkeyChallenges } from '../../infrastructure/database/schema'
import { requirePrincipal } from '../../infrastructure/auth/platform'
import { loginUser } from '../../infrastructure/auth/login'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const cookieName = (purpose: string) => `aparts-passkey-${purpose}`
const cookiePath = '/api/auth/passkeys'
export type RegistrationResponseJSON = Parameters<typeof verifyRegistrationResponse>[0]['response']
export type AuthenticationResponseJSON = Parameters<typeof verifyAuthenticationResponse>[0]['response']
type Purpose = 'register' | 'authenticate'
const invalid = () => createError({ statusCode: 400, statusMessage: 'Не удалось проверить ключ. Попробуйте ещё раз' })

// Trust the configured public origin, never a client-controlled Host/proxy header.
export function passkeyOrigin(event: H3Event) {
  const url = new URL(useRuntimeConfig(event).public.appUrl)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw createError({ statusCode: 503, statusMessage: 'Для ключей доступа требуется HTTPS' })
  }
  if (getHeader(event, 'origin') !== url.origin) throw createError({ statusCode: 403, statusMessage: 'Недопустимый источник запроса' })
  return { origin: url.origin, rpID: url.hostname, secure: url.protocol === 'https:' }
}

export async function issuePasskeyChallenge(event: H3Event, purpose: Purpose, challenge: string, userId?: string) {
  const { secure } = passkeyOrigin(event)
  const browserSecret = randomBytes(32).toString('base64url')
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, new Date()))
  const [attempt] = await db.insert(passkeyChallenges).values({ purpose, challenge, userId, browserHash: hash(browserSecret), expiresAt: new Date(Date.now() + 300_000) }).returning({ id: passkeyChallenges.id })
  setCookie(event, cookieName(purpose), browserSecret, { httpOnly: true, secure, sameSite: 'strict', path: cookiePath, maxAge: 300 })
  return attempt!.id
}

export async function consumePasskeyChallenge(event: H3Event, purpose: Purpose, id: string, userId?: string) {
  passkeyOrigin(event)
  const secret = getCookie(event, cookieName(purpose))
  if (!secret) throw invalid()
  // DELETE ... RETURNING claims the attempt atomically, including across servers.
  const [attempt] = await db.delete(passkeyChallenges).where(and(
    eq(passkeyChallenges.id, id), eq(passkeyChallenges.purpose, purpose),
    eq(passkeyChallenges.browserHash, hash(secret)), gt(passkeyChallenges.expiresAt, new Date()),
    userId ? eq(passkeyChallenges.userId, userId) : isNull(passkeyChallenges.userId)
  )).returning()
  if (!attempt) throw invalid()
  deleteCookie(event, cookieName(purpose), { path: cookiePath })
  return attempt.challenge
}

async function ownUser(event: H3Event) {
  const actor = await requirePrincipal(event)
  // Account credentials belong to the principal, also while a superuser is
  // supporting another organization. Client context must not change ownership.
  const user = await db.query.users.findFirst({ where: and(eq(users.id, actor.id), eq(users.status, 'active')) })
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Учётная запись недоступна' })
  return user
}

export async function passkeyRegistrationOptions(event: H3Event, password: string) {
  const { rpID } = passkeyOrigin(event)
  const user = await ownUser(event)
  if (!await verifyPassword(user.passwordHash, password)) throw createError({ statusCode: 401, statusMessage: 'Неверный пароль' })
  const existing = await db.query.passkeys.findMany({ where: eq(passkeys.userId, user.id) })
  const options = await generateRegistrationOptions({
    rpName: 'Aparts', rpID, userID: new TextEncoder().encode(user.id), userName: user.email, userDisplayName: user.name,
    attestationType: 'none', excludeCredentials: existing.map(key => ({ id: key.id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
  })
  const attemptId = await issuePasskeyChallenge(event, 'register', options.challenge, user.id)
  return { options, attemptId }
}

export async function registerPasskey(event: H3Event, attemptId: string, response: RegistrationResponseJSON, name: string) {
  const { origin, rpID } = passkeyOrigin(event)
  const user = await ownUser(event)
  const challenge = await consumePasskeyChallenge(event, 'register', attemptId, user.id)
  const verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(() => { throw invalid() })
  if (!verification.verified || !verification.registrationInfo) throw invalid()
  const key = verification.registrationInfo.credential
  await db.insert(passkeys).values({ id: key.id, userId: user.id, publicKey: Buffer.from(key.publicKey).toString('base64url'), counter: key.counter, transports: key.transports ?? [], name })
  return { ok: true }
}

export async function passkeyAuthenticationOptions(event: H3Event) {
  const { rpID } = passkeyOrigin(event)
  // Discoverable credentials avoid exposing account emails or credential IDs.
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' })
  const attemptId = await issuePasskeyChallenge(event, 'authenticate', options.challenge)
  return { options, attemptId }
}

export async function authenticatePasskey(event: H3Event, attemptId: string, response: AuthenticationResponseJSON) {
  const { origin, rpID } = passkeyOrigin(event)
  const challenge = await consumePasskeyChallenge(event, 'authenticate', attemptId)
  const key = await db.query.passkeys.findFirst({ where: eq(passkeys.id, response.id) })
  if (!key || (response.response.userHandle && response.response.userHandle !== Buffer.from(key.userId).toString('base64url'))) throw invalid()
  const verification = await verifyAuthenticationResponse({
    response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    credential: { id: key.id, publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64url')), counter: key.counter }
  }).catch(() => { throw invalid() })
  if (!verification.verified) throw invalid()
  const [updated] = await db.update(passkeys).set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(and(eq(passkeys.id, key.id), eq(passkeys.userId, key.userId), eq(passkeys.counter, key.counter))).returning({ id: passkeys.id })
  if (!updated) throw invalid()
  return loginUser(event, key.userId)
}

export async function listPasskeys(event: H3Event) {
  const user = await ownUser(event)
  return db.select({ id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt }).from(passkeys).where(eq(passkeys.userId, user.id))
}

export async function deletePasskey(event: H3Event, id: string) {
  passkeyOrigin(event)
  const user = await ownUser(event)
  const [removed] = await db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, user.id))).returning({ id: passkeys.id })
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Ключ не найден' })
  return { ok: true }
}
