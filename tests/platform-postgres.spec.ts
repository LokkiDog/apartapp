import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createError, createEvent, getResponseHeader, defineEventHandler, getQuery, getRouterParam } from 'h3'
import webpush from 'web-push'

import { authenticator } from './helpers/passkey'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { eq, sql as querySql } from 'drizzle-orm'
import { fetchIcal } from '../server/modules/calendar-import/ical'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as tables from '../server/infrastructure/database/schema'
import { sendAccountLink, sendRegistrationLink, sendNotificationEmail } from '../server/infrastructure/mail/send'

vi.mock('../server/modules/calendar-import/ical', () => ({ fetchIcal: vi.fn() }))
vi.mock('../server/infrastructure/mail/send', () => ({ sendAccountLink: vi.fn(), sendRegistrationLink: vi.fn(), sendNotificationEmail: vi.fn() }))
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }))
const url = process.env.PLATFORM_TEST_DATABASE_URL
let db: typeof import('../server/infrastructure/database/client').db
let connection: typeof import('../server/infrastructure/database/client').sql
let registration: typeof import('../server/modules/auth/registration.service')
let platform: typeof import('../server/modules/platform/platform.service')
let auth: typeof import('../server/infrastructure/auth/platform')
let actors: typeof import('../server/infrastructure/auth/actor')
let accounts: typeof import('../server/modules/auth/account.service')
let passkeyService: typeof import('../server/modules/auth/passkey.service')
let passwords: typeof import('../server/modules/auth/password.service')
let profiles: typeof import('../server/modules/auth/profile.service')
let sessionUser: Record<string, unknown> | undefined

// This suite intentionally refuses every DB name except the disposable test DB.
describe.skipIf(!url)('platform PostgreSQL integration', () => {
  beforeAll(async () => {
    if (new URL(url!).pathname !== '/aparts_platform_test') throw new Error('Use the isolated aparts_platform_test database only')
    process.env.DATABASE_URL = url
    const database = await import('../server/infrastructure/database/client')
    db = database.db; connection = database.sql
    await db.execute(querySql`SET client_min_messages TO WARNING`)
    await db.execute(querySql`DROP SCHEMA IF EXISTS public CASCADE`)
    await db.execute(querySql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(querySql`CREATE SCHEMA public`)
    await migrate(db, { migrationsFolder: 'server/infrastructure/database/migrations' })
    registration = await import('../server/modules/auth/registration.service')
    platform = await import('../server/modules/platform/platform.service')
    auth = await import('../server/infrastructure/auth/platform')
    actors = await import('../server/infrastructure/auth/actor')
    accounts = await import('../server/modules/auth/account.service')
    passkeyService = await import('../server/modules/auth/passkey.service')
    passwords = await import('../server/modules/auth/password.service')
    profiles = await import('../server/modules/auth/profile.service')
  }, 30000)
  afterAll(async () => { vi.unstubAllGlobals(); await connection?.end() })
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(fetchIcal).mockResolvedValue([])
    vi.mocked(sendAccountLink).mockResolvedValue(undefined)
    vi.mocked(sendRegistrationLink).mockResolvedValue(undefined)
    vi.mocked(sendNotificationEmail).mockReset().mockResolvedValue(undefined)
    vi.mocked(webpush.sendNotification).mockReset().mockResolvedValue({} as any)
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('getQuery', getQuery)
    vi.stubGlobal('getRouterParam', getRouterParam)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('hashPassword', async (password: string) => `hashed:${password}`)
    vi.stubGlobal('verifyPassword', async (hash: string, password: string) => hash === `hashed:${password}`)
    vi.stubGlobal('requireUserSession', async () => ({ user: sessionUser }))
    vi.stubGlobal('getUserSession', async () => ({ user: sessionUser }))
    // Renewal transport is separately covered by auth-session.spec.ts.
    vi.stubGlobal('setUserSession', async () => undefined)
    vi.stubGlobal('useRuntimeConfig', () => ({ session: { password: 'platform-test-password-more-than-32-chars' }, public: { appUrl: 'https://aparts.example' } }))
    await db.execute(querySql`SET client_min_messages TO WARNING`)
    await db.execute(querySql`TRUNCATE organizations, pending_registrations, registration_attempts, platform_audit_logs CASCADE`)
    await db.update(tables.systemSettings).set({ registrationMode: 'superuser_only' })
    sessionUser = undefined
  })
  async function fixture(isSuperuser = false) {
    const [client] = await db.insert(tables.organizations).values({ name: 'Company' }).returning()
    const [other] = await db.insert(tables.organizations).values({ name: 'Company' }).returning()
    const [user] = await db.insert(tables.users).values({ organizationId: client!.id, name: 'Admin', email: 'admin@example.com', passwordHash: 'hashed:password123', status: 'active', roles: ['administrator'], isSuperuser }).returning()
    const [session] = await db.insert(tables.platformSessions).values({ userId: user!.id, organizationId: isSuperuser ? null : client!.id, expiresAt: auth.sessionExpiry() }).returning()
    sessionUser = { id: user!.id, platformSessionId: session!.id, sessionVersion: auth.SESSION_VERSION }
    const principal = await auth.requirePrincipal(event(), false)
    return { client: client!, other: other!, user: user!, session: session!, principal }
  }
  function event(context?: string) {
    const request = new IncomingMessage(new Socket()); request.method = 'GET'; request.url = '/api/hotels'
    if (context) request.headers['x-client-context'] = context
    return createEvent(request, new ServerResponse(request))
  }
  function passkeyEvent(cookie?: string, origin = 'https://aparts.example') {
    const request = event()
    request.node.req.headers.origin = origin
    if (cookie) request.node.req.headers.cookie = cookie
    return request
  }
  function challengeCookie(request: ReturnType<typeof event>) {
    const headers = getResponseHeader(request, 'set-cookie')
    const cookie = (Array.isArray(headers) ? headers : [String(headers)]).find(value => value.startsWith('aparts-passkey-'))!
    return cookie.split(';')[0]!
  }
  async function enrolledPasskey() {
    const account = await fixture()
    const device = authenticator()
    const request = passkeyEvent()
    const registration = await passkeyService.passkeyRegistrationOptions(request, 'password123')
    await passkeyService.registerPasskey(passkeyEvent(challengeCookie(request)), registration.attemptId, device.registration(registration.options.challenge), 'Phone')
    return { ...account, device }
  }

  it.each(['administrator', 'manager', 'cleaner', 'specialist'] as const)('updates only the %s own name and refreshes the session principal', async role => {
    const { user, principal, other } = await fixture()
    await db.update(tables.users).set({ roles: [role] }).where(eq(tables.users.id, user.id))
    const [foreign] = await db.insert(tables.users).values({ organizationId: other.id, name: 'Foreign', email: 'foreign@example.com', passwordHash: 'foreign-hash', status: 'active' }).returning()
    await expect(profiles.updateOwnProfile({ ...principal, organizationId: other.id }, { name: 'Changed' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(profiles.updateOwnProfile(principal, { name: 'Changed', userId: foreign!.id })).rejects.toThrow()
    expect(await profiles.updateOwnProfile(principal, { name: '  New Name  ' })).toEqual({ name: 'New Name' })
    expect(await db.query.users.findFirst({ where: eq(tables.users.id, user.id) })).toMatchObject({ name: 'New Name', email: user.email, roles: [role], passwordHash: user.passwordHash, organizationId: user.organizationId })
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, foreign!.id) }))!.name).toBe('Foreign')
    expect(await auth.requirePrincipal(event(), false)).toMatchObject({ name: 'New Name', roles: [role], platformSessionId: principal.platformSessionId })
  })
  it('edits the superuser profile independently of client context', async () => {
    const { user, principal, other } = await fixture(true)
    await profiles.updateOwnProfile({ ...principal, organizationId: other.id }, { name: 'Support Admin' })
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!.name).toBe('Support Admin')
  })

  it('changes only the account password, preserves its current session and keys, and revokes other sessions and old reset/enrollment attempts', async () => {
    const { user, other, session, principal } = await enrolledPasskey()
    const [otherSession] = await db.insert(tables.platformSessions).values({ userId: user.id, organizationId: user.organizationId, expiresAt: auth.sessionExpiry() }).returning()
    const [foreign] = await db.insert(tables.users).values({ organizationId: other.id, name: 'Other', email: 'other@example.com', passwordHash: 'hashed:foreign-password', status: 'active' }).returning()
    const [foreignSession] = await db.insert(tables.platformSessions).values({ userId: foreign!.id, organizationId: other.id, expiresAt: auth.sessionExpiry() }).returning()
    await db.insert(tables.authTokens).values({ userId: user.id, type: 'password_reset', tokenHash: 'old-reset', expiresAt: auth.sessionExpiry() })
    const enrollment = await passkeyService.passkeyRegistrationOptions(passkeyEvent(), 'password123')

    await expect(passwords.changeOwnPassword(principal, 'wrong-password', 'new-password')).rejects.toMatchObject({ statusCode: 400, data: { code: 'INCORRECT_PASSWORD' } })
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!.passwordHash).toBe('hashed:password123')
    expect(await db.query.platformSessions.findFirst({ where: eq(tables.platformSessions.id, otherSession!.id) })).toBeDefined()
    expect(await db.query.authTokens.findFirst({ where: eq(tables.authTokens.userId, user.id) })).toBeDefined()

    await passwords.changeOwnPassword(principal, 'password123', 'new-password')
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!.passwordHash).toBe('hashed:new-password')
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, foreign!.id) }))!.passwordHash).toBe('hashed:foreign-password')
    expect(await db.query.platformSessions.findFirst({ where: eq(tables.platformSessions.id, session.id) })).toBeDefined()
    expect(await db.query.platformSessions.findFirst({ where: eq(tables.platformSessions.id, otherSession!.id) })).toBeUndefined()
    expect(await db.query.platformSessions.findFirst({ where: eq(tables.platformSessions.id, foreignSession!.id) })).toBeDefined()
    expect(await db.query.authTokens.findFirst({ where: eq(tables.authTokens.userId, user.id) })).toBeUndefined()
    expect(await db.query.passkeyChallenges.findFirst({ where: eq(tables.passkeyChallenges.id, enrollment.attemptId) })).toBeUndefined()
    expect(await passkeyService.listPasskeys(passkeyEvent())).toMatchObject([{ name: 'Phone' }])
    await expect(passwords.changeOwnPassword(principal, 'password123', 'another-password')).rejects.toMatchObject({ statusCode: 400 })
  })

  it.each(['administrator', 'manager', 'cleaner', 'specialist'] as const)('allows an active %s to change their own password and rejects a foreign organization', async role => {
    const { user, principal, other } = await fixture()
    await db.update(tables.users).set({ roles: [role] }).where(eq(tables.users.id, user.id))
    await expect(passwords.changeOwnPassword({ ...principal, roles: [role], organizationId: other.id }, 'password123', 'new-password')).rejects.toMatchObject({ statusCode: 400 })
    await passwords.changeOwnPassword({ ...principal, roles: [role] }, 'password123', 'new-password')
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!.passwordHash).toBe('hashed:new-password')
  })

  it('keeps password ownership with a superuser while supporting a different client', async () => {
    const { user, principal, other } = await fixture(true)
    await passwords.changeOwnPassword({ ...principal, organizationId: other.id }, 'password123', 'new-password')
    expect((await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!.passwordHash).toBe('hashed:new-password')
  })

  it('requires an active session and password to enroll a key and scopes key management to its owner', async () => {
    await expect(passkeyService.passkeyRegistrationOptions(passkeyEvent(), 'password123')).rejects.toMatchObject({ statusCode: 401 })
    const { user, other } = await enrolledPasskey()
    await expect(passkeyService.passkeyRegistrationOptions(passkeyEvent(), 'wrong')).rejects.toMatchObject({ statusCode: 401 })
    expect(await passkeyService.listPasskeys(passkeyEvent())).toMatchObject([{ name: 'Phone' }])
    const [foreign] = await db.insert(tables.users).values({ organizationId: other.id, name: 'Other', email: 'other@example.com', passwordHash: 'hash', status: 'active' }).returning()
    await db.insert(tables.passkeys).values({ id: 'foreign', userId: foreign!.id, publicKey: 'key', name: 'Other phone' })
    await expect(passkeyService.deletePasskey(passkeyEvent(), 'foreign')).rejects.toMatchObject({ statusCode: 404 })
    const [own] = await passkeyService.listPasskeys(passkeyEvent())
    await passkeyService.deletePasskey(passkeyEvent(), own!.id)
    expect(await passkeyService.listPasskeys(passkeyEvent())).toEqual([])
    expect((await db.query.passkeys.findFirst())!.userId).not.toBe(user.id)
  })
  it('authenticates a real signed assertion, replaces the session and consumes the challenge once', async () => {
    const { user, session, device } = await enrolledPasskey()
    const request = passkeyEvent()
    const attempt = await passkeyService.passkeyAuthenticationOptions(request)
    const cookie = challengeCookie(request)
    const response = device.assertion(attempt.options.challenge, user.id)
    vi.stubGlobal('setUserSession', async (_event: unknown, data: { user: Record<string, unknown> }) => { sessionUser = data.user })
    const result = await passkeyService.authenticatePasskey(passkeyEvent(cookie), attempt.attemptId, response)
    expect(result.user.id).toBe(user.id)
    expect(result.user.platformSessionId).not.toBe(session.id)
    expect(await db.query.platformSessions.findFirst({ where: eq(tables.platformSessions.id, session.id) })).toBeUndefined()
    expect((await db.query.passkeys.findFirst())!.counter).toBe(1)
    await expect(passkeyService.authenticatePasskey(passkeyEvent(cookie), attempt.attemptId, response)).rejects.toMatchObject({ statusCode: 400 })
    // The deleted key cannot be used again, even with a fresh valid assertion.
    await passkeyService.deletePasskey(passkeyEvent(), device.id)
    const next = passkeyEvent(); const options = await passkeyService.passkeyAuthenticationOptions(next)
    await expect(passkeyService.authenticatePasskey(passkeyEvent(challengeCookie(next)), options.attemptId, device.assertion(options.options.challenge, user.id, { counter: 2 }))).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects foreign origins, RP IDs, missing verification, wrong challenges and invalid signatures', async () => {
    const { user, device } = await enrolledPasskey()
    await expect(passkeyService.passkeyAuthenticationOptions(passkeyEvent(undefined, 'https://evil.example'))).rejects.toMatchObject({ statusCode: 403 })
    for (const alteration of [{ origin: 'https://evil.example' }, { rpID: 'evil.example' }, { flags: 1 }, { challenge: 'wrong-challenge' }, { signature: true }, { userHandle: true }]) {
      const request = passkeyEvent(); const attempt = await passkeyService.passkeyAuthenticationOptions(request)
      const response = device.assertion('challenge' in alteration ? alteration.challenge! : attempt.options.challenge, user.id, alteration)
      if ('signature' in alteration) response.response.signature = Buffer.alloc(64).toString('base64url')
      if ('userHandle' in alteration) response.response.userHandle = Buffer.from('foreign-user').toString('base64url')
      await expect(passkeyService.authenticatePasskey(passkeyEvent(challengeCookie(request)), attempt.attemptId, response)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect((await db.query.passkeys.findFirst())!.counter).toBe(0)
  })
  it('binds challenges to the initiating browser and account, expires them and rejects a blocked client', async () => {
    const { user, client, device } = await enrolledPasskey()
    const request = passkeyEvent(); const attempt = await passkeyService.passkeyAuthenticationOptions(request)
    const response = device.assertion(attempt.options.challenge, user.id)
    await expect(passkeyService.authenticatePasskey(passkeyEvent(), attempt.attemptId, response)).rejects.toMatchObject({ statusCode: 400 })
    await expect(passkeyService.consumePasskeyChallenge(passkeyEvent(challengeCookie(request)), 'register', attempt.attemptId, user.id)).rejects.toMatchObject({ statusCode: 400 })
    const enrollment = passkeyEvent()
    const registration = await passkeyService.passkeyRegistrationOptions(enrollment, 'password123')
    await expect(passkeyService.consumePasskeyChallenge(passkeyEvent(challengeCookie(enrollment)), 'register', registration.attemptId, client.id)).rejects.toMatchObject({ statusCode: 400 })
    await db.update(tables.passkeyChallenges).set({ expiresAt: new Date(0) }).where(eq(tables.passkeyChallenges.id, attempt.attemptId))
    await expect(passkeyService.authenticatePasskey(passkeyEvent(challengeCookie(request)), attempt.attemptId, response)).rejects.toMatchObject({ statusCode: 400 })
    const next = passkeyEvent(); const options = await passkeyService.passkeyAuthenticationOptions(next)
    await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, client.id))
    await expect(passkeyService.authenticatePasskey(passkeyEvent(challengeCookie(next)), options.attemptId, device.assertion(options.options.challenge, user.id))).rejects.toMatchObject({ statusCode: 401 })
    await db.update(tables.organizations).set({ status: 'active' }).where(eq(tables.organizations.id, client.id))
    for (const status of ['blocked', 'archived', 'invited'] as const) {
      const request = passkeyEvent(); const attempt = await passkeyService.passkeyAuthenticationOptions(request)
      await db.update(tables.users).set({ status }).where(eq(tables.users.id, user.id))
      await expect(passkeyService.authenticatePasskey(passkeyEvent(challengeCookie(request)), attempt.attemptId, device.assertion(attempt.options.challenge, user.id, { counter: 2 + ['blocked', 'archived', 'invited'].indexOf(status) }))).rejects.toMatchObject({ statusCode: 401 })
    }
  })
  const registrationInput = { companyName: 'New Company', name: 'New Admin', email: 'new@example.com', password: 'password123' }
  async function openRegistration() { await db.update(tables.systemSettings).set({ registrationMode: 'self_service' }) }
  function lastToken() { return vi.mocked(sendRegistrationLink).mock.calls.at(-1)![0].token }

  it('closes existing self-service registration after migration, including pending confirmation and resend', async () => {
    expect(await registration.registrationMode()).toBe('superuser_only')
    await openRegistration()
    await registration.registerCompany(registrationInput)
    const token = lastToken()
    await db.execute(querySql.raw(readFileSync('server/infrastructure/database/migrations/0047_invitation_only_registration.sql', 'utf8')))
    expect(await registration.registrationMode()).toBe('superuser_only')
    await expect(registration.registerCompany(registrationInput)).rejects.toMatchObject({ statusCode: 403 })
    await expect(registration.resendRegistration('new@example.com')).rejects.toMatchObject({ statusCode: 403 })
    await expect(registration.confirmRegistration(token)).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.query.organizations.findMany()).toHaveLength(0)
  })
  it('creates the client only on email confirmation and consumes the token once', async () => {
    await openRegistration(); await registration.registerCompany(registrationInput)
    expect(await db.query.organizations.findMany()).toHaveLength(0)
    const pending = await db.query.pendingRegistrations.findFirst()
    expect(pending!.passwordHash).not.toBe(registrationInput.password)
    const token = lastToken(); expect(pending!.tokenHash).not.toBe(token)
    await registration.confirmRegistration(token)
    const users = await db.query.users.findMany()
    expect(users).toHaveLength(1); expect(users[0]!.roles).toEqual(['administrator']); expect(users[0]!.isSuperuser).toBe(false)
    await expect(registration.confirmRegistration(token)).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.query.organizations.findMany()).toHaveLength(1)
  })
  it('rejects expired tokens and confirmations after registration is closed', async () => {
    await openRegistration(); await registration.registerCompany(registrationInput)
    const token = lastToken()
    await db.update(tables.pendingRegistrations).set({ expiresAt: new Date(0) })
    await expect(registration.confirmRegistration(token)).rejects.toMatchObject({ statusCode: 400 })
    await db.update(tables.systemSettings).set({ registrationMode: 'superuser_only' })
    await expect(registration.confirmRegistration(token)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('serializes concurrent registrations and confirmations for one email', async () => {
    await openRegistration()
    const results = await Promise.allSettled([registration.registerCompany(registrationInput), registration.registerCompany(registrationInput)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const token = lastToken()
    const confirmations = await Promise.allSettled([registration.confirmRegistration(token), registration.confirmRegistration(token)])
    expect(confirmations.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.query.organizations.findMany()).toHaveLength(1)
  })
  it('retains failed mail requests and lets the user resend with a new token', async () => {
    await openRegistration(); vi.mocked(sendRegistrationLink).mockRejectedValueOnce(new Error('mail offline'))
    await expect(registration.registerCompany(registrationInput)).rejects.toThrow('mail offline')
    const oldToken = lastToken()
    await db.update(tables.pendingRegistrations).set({ sentAt: new Date(Date.now() - 61_000) })
    await registration.resendRegistration(registrationInput.email)
    await expect(registration.confirmRegistration(oldToken)).rejects.toMatchObject({ statusCode: 400 })
    await registration.confirmRegistration(lastToken())
    expect(await db.query.users.findMany()).toHaveLength(1)
  })
  it('creates clients through the superuser while public registration is closed', async () => {
    const { principal } = await fixture(true)
    vi.mocked(sendAccountLink).mockRejectedValueOnce(new Error('mail offline'))
    const client = await platform.createClient(principal, { name: 'Client', timezone: 'Europe/Sofia', administratorName: 'Admin', email: 'other@example.com' })
    expect(client.invitationSent).toBe(false)
    const invited = await db.query.users.findFirst({ where: eq(tables.users.organizationId, client.id) })
    expect(invited!.status).toBe('invited')
    expect(await db.query.authTokens.findMany()).toHaveLength(1)
    expect(await db.query.platformAuditLogs.findMany()).toHaveLength(1)
  })
  it('rolls back the client when the administrator email is already taken', async () => {
    const { principal } = await fixture(true)
    await expect(platform.createClient(principal, { name: 'Client', timezone: 'Europe/Sofia', administratorName: 'Admin', email: 'admin@example.com' })).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.query.organizations.findMany()).toHaveLength(2)
  })
  it('prevents ordinary accounts from choosing another client or using platform APIs', async () => {
    const { session, other } = await fixture()
    await expect(auth.requireSuperuser(event())).rejects.toMatchObject({ statusCode: 403 })
    const principal = await auth.requirePrincipal(event(), false)
    await expect(platform.selectClient(principal, other.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(platform.listClients(principal)).rejects.toMatchObject({ statusCode: 403 })
    await db.update(tables.platformSessions).set({ organizationId: other.id }).where(eq(tables.platformSessions.id, session.id))
    await expect(auth.requirePrincipal(event(), false)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects old cookies and expired or revoked server sessions', async () => {
    const { session } = await fixture()
    sessionUser!.sessionVersion = 1
    await expect(auth.requirePrincipal(event(), false)).rejects.toMatchObject({ statusCode: 401 })
    sessionUser!.sessionVersion = auth.SESSION_VERSION
    await db.update(tables.platformSessions).set({ expiresAt: new Date(0) }).where(eq(tables.platformSessions.id, session.id))
    await expect(auth.requirePrincipal(event(), false)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects stale superuser requests and supports blocked clients with the real author ID', async () => {
    const { principal, other, user } = await fixture(true)
    await expect(actors.requireActor(event())).rejects.toMatchObject({ statusCode: 409 })
    await platform.selectClient(principal, other.id)
    const current = await auth.requirePrincipal(event(), false)
    await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, other.id))
    await expect(actors.requireActor(event(`${other.id}:old-revision`))).rejects.toMatchObject({ statusCode: 409 })
    const actor = await actors.requireActor(event(`${other.id}:${current.contextRevision}`))
    expect(actor.id).toBe(user.id); expect(actor.organizationId).toBe(other.id); expect(actor.roles).toEqual(['administrator'])
    await platform.selectClient(actor, null)
    await expect(actors.requireActor(event(`${other.id}:${current.contextRevision}`))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('revokes client access and password links on block, preserves data and restores access on unblock', async () => {
    const { client, principal } = await fixture()
    await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, client.id))
    await expect(auth.requirePrincipal(event(), false)).rejects.toMatchObject({ statusCode: 401 })
    await accounts.requestPasswordReset('admin@example.com')
    expect(sendAccountLink).not.toHaveBeenCalled()
    expect(await db.query.users.findMany()).toHaveLength(1)
    await db.update(tables.organizations).set({ status: 'active' }).where(eq(tables.organizations.id, client.id))
    expect((await auth.requirePrincipal(event(), false)).id).toBe(principal.id)
  })
  it('defaults preferences, scopes updates and preserves preferences hidden by a role change', async () => {
    const { principal, other } = await fixture()
    const preferences = await import('../server/infrastructure/notification/preferences')
    const initial = await preferences.getNotificationPreferences(principal)
    expect(initial.find(row => row.event === 'booking_created')).toEqual({ event: 'booking_created', crm: true, push: true, email: false })
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', crm: false, push: false, email: true }] })
    expect((await preferences.getNotificationPreferences(principal)).find(row => row.event === 'manual')!.email).toBe(true)
    expect((await preferences.getNotificationPreferences({ ...principal, organizationId: other.id })).find(row => row.event === 'manual')!.email).toBe(false)
    const cleaner = { ...principal, roles: ['cleaner'] as typeof principal.roles }
    await expect(preferences.updateNotificationPreferences(cleaner, { changes: [{ event: 'booking_created', crm: false, push: false, email: false }] })).rejects.toMatchObject({ statusCode: 403 })
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'booking_created', crm: false, push: false, email: true }] })
    await preferences.updateNotificationPreferences(cleaner, { changes: [{ event: 'manual', crm: true, push: false, email: false }] })
    expect((await preferences.getNotificationPreferences(principal)).find(row => row.event === 'booking_created')!.email).toBe(true)
  })

  it.each(Array.from({ length: 8 }, (_, mask) => ({ crm: !!(mask & 1), push: !!(mask & 2), email: !!(mask & 4) })))('delivers channels independently: %j', async channels => {
    const { principal, user, client } = await fixture()
    const preferences = await import('../server/infrastructure/notification/preferences')
    const publisher = await import('../server/infrastructure/notification/publish')
    const realtime = await import('../server/infrastructure/notification/realtime')
    const queue = await import('../server/infrastructure/notification/email-queue')
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', ...channels }] })
    await db.update(tables.users).set({ locale: 'en' }).where(eq(tables.users.id, user.id))
    await db.insert(tables.pushSubscriptions).values({ userId: user.id, endpoint: 'https://push.example/endpoint', p256dh: 'key', auth: 'auth' })
    vi.stubGlobal('useRuntimeConfig', () => ({ session: { password: 'platform-test-password-more-than-32-chars' }, public: { appUrl: 'https://aparts.example' }, vapidPublicKey: 'public', vapidPrivateKey: 'private', vapidSubject: 'mailto:push@example.com' }))
    const received = vi.fn()
    realtime.registerNotificationPeer(user.id, { id: 'channel-test', send: received })
    try {
      expect(await publisher.notifyUsers({ organizationId: client.id, userIds: [user.id], type: 'manual', eventKey: 'manual', title: { ru: 'Сообщение', en: 'Message', he: 'הודעה' }, body: { ru: 'Текст', en: 'Body', he: 'תוכן' }, href: null })).toBe(1)
      expect(received).toHaveBeenCalledTimes(channels.crm ? 1 : 0)
      expect(webpush.sendNotification).toHaveBeenCalledTimes(channels.push ? 1 : 0)
      const list = (await import('../server/api/notifications/index.get')).default
      const count = (await import('../server/api/notifications/unread-count.get')).default
      const markAll = (await import('../server/api/notifications/read-all.post')).default
      expect(await list(event())).toHaveLength(channels.crm ? 1 : 0)
      expect(await count(event())).toEqual({ count: channels.crm ? 1 : 0 })
      const markOne = (await import('../server/api/notifications/[id]/read.post')).default
      const one = event(); one.context.params = { id: (await db.query.notifications.findFirst())!.id }
      await markOne(one)
      await markAll(event())
      expect((await db.query.notifications.findFirst())!.readAt !== null).toBe(channels.crm)
      await queue.processNotificationEmails()
      expect(sendNotificationEmail).toHaveBeenCalledTimes(channels.email ? 1 : 0)
      if (channels.email) {
        expect(sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: user.email, subject: 'Message', text: expect.stringContaining('Body') }))
        const text = vi.mocked(sendNotificationEmail).mock.calls[0]![0].text
        expect(text.includes('/notifications')).toBe(channels.crm)
      }
    } finally { realtime.unregisterNotificationPeer(user.id, { id: 'channel-test', send: received }) }
  })

  it('retries failed email delivery, limits attempts, prevents parallel sends and rechecks opt-outs', async () => {
    const { principal, user, client } = await fixture()
    const preferences = await import('../server/infrastructure/notification/preferences')
    const publisher = await import('../server/infrastructure/notification/publish')
    const queue = await import('../server/infrastructure/notification/email-queue')
    const input = { organizationId: client.id, userIds: [user.id], type: 'manual' as const, eventKey: 'manual' as const, title: 'Title', body: 'Body', href: '/work' }
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', crm: false, push: false, email: true }] })
    await publisher.notifyUsers(input)
    vi.mocked(sendNotificationEmail).mockRejectedValueOnce(new Error('transport unavailable'))
    await queue.processNotificationEmails()
    let job = (await db.query.notificationEmailQueue.findFirst())!
    expect(job).toMatchObject({ status: 'pending', attempts: 1, leaseToken: null, lastError: 'delivery_failed' })
    expect(job.availableAt.getTime()).toBeGreaterThan(Date.now())
    await queue.processNotificationEmails()
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1)
    await db.update(tables.notificationEmailQueue).set({ availableAt: new Date(0) })
    await Promise.all([queue.processNotificationEmails(), queue.processNotificationEmails()])
    expect(sendNotificationEmail).toHaveBeenCalledTimes(2)
    expect((await db.query.notificationEmailQueue.findFirst())!.status).toBe('sent')

    await publisher.notifyUsers(input)
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', crm: false, push: false, email: false }] })
    await queue.processNotificationEmails()
    expect(sendNotificationEmail).toHaveBeenCalledTimes(2)
    expect((await db.query.notificationEmailQueue.findMany()).some(row => row.status === 'skipped')).toBe(true)

    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', crm: false, push: false, email: true }] })
    await publisher.notifyUsers(input)
    await db.update(tables.notificationEmailQueue).set({ attempts: 4 }).where(eq(tables.notificationEmailQueue.status, 'pending'))
    vi.mocked(sendNotificationEmail).mockRejectedValueOnce(new Error('unavailable'))
    await queue.processNotificationEmails()
    expect((await db.query.notificationEmailQueue.findMany()).some(row => row.status === 'failed' && row.attempts === 5)).toBe(true)
  })

  it('recovers expired email leases and keeps pre-preference notifications in the inbox', async () => {
    const { principal, user, client } = await fixture()
    const preferences = await import('../server/infrastructure/notification/preferences')
    const publisher = await import('../server/infrastructure/notification/publish')
    const queue = await import('../server/infrastructure/notification/email-queue')
    await db.insert(tables.notifications).values({ organizationId: client.id, userId: user.id, type: 'manual', title: 'Earlier message', body: 'History' })
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', crm: false, push: false, email: true }] })
    await publisher.notifyUsers({ organizationId: client.id, userIds: [user.id], type: 'manual', eventKey: 'manual', title: 'New message', body: 'Body', href: null })
    const list = (await import('../server/api/notifications/index.get')).default
    expect(await list(event())).toMatchObject([{ title: 'Earlier message' }])
    const job = (await db.query.notificationEmailQueue.findFirst())!
    await expect(db.insert(tables.notificationEmailQueue).values({ notificationId: job.notificationId })).rejects.toThrow()
    await db.update(tables.notificationEmailQueue).set({ leaseUntil: new Date(Date.now() + 60_000), leaseToken: '00000000-0000-4000-8000-000000000001' })
    expect(await queue.processNotificationEmails()).toBe(0)
    await db.update(tables.notificationEmailQueue).set({ leaseUntil: new Date(0) })
    expect(await queue.processNotificationEmails()).toBe(1)
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1)
    expect((await db.query.notificationEmailQueue.findFirst())!.status).toBe('sent')
  })

  it.each(['user', 'organization'] as const)('suppresses queued email after blocking the %s', async target => {
    const { principal, user, client } = await fixture()
    const preferences = await import('../server/infrastructure/notification/preferences')
    const publisher = await import('../server/infrastructure/notification/publish')
    const queue = await import('../server/infrastructure/notification/email-queue')
    await preferences.updateNotificationPreferences(principal, { changes: [{ event: 'manual', crm: true, push: true, email: true }] })
    await publisher.notifyUsers({ organizationId: client.id, userIds: [user.id], type: 'manual', eventKey: 'manual', title: 'Title', body: 'Body', href: null })
    if (target === 'user') await db.update(tables.users).set({ status: 'archived' }).where(eq(tables.users.id, user.id))
    else await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, client.id))
    await queue.processNotificationEmails()
    expect(sendNotificationEmail).not.toHaveBeenCalled()
    expect((await db.query.notificationEmailQueue.findFirst())!.status).toBe('skipped')
  })

  it('scopes notification recipients and suppresses delivery for blocked clients', async () => {
    const { client, other, user } = await fixture()
    const [foreign] = await db.insert(tables.users).values({ organizationId: other.id, name: 'Other Admin', email: 'foreign@example.com', passwordHash: 'hash', status: 'active', roles: ['administrator'] }).returning()
    const notifications = await import('../server/infrastructure/notification/publish')
    const input = { organizationId: client.id, userIds: [user.id, foreign!.id], type: 'manual' as const, eventKey: 'manual' as const, title: 'Title', body: 'Body', href: null }
    expect(await notifications.notifyUsers(input)).toBe(1)
    expect((await db.query.notifications.findMany()).map(row => row.userId)).toEqual([user.id])
    await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, client.id))
    expect(await notifications.notifyUsers(input)).toBe(0)
    expect(await db.query.notifications.findMany()).toHaveLength(1)
  })
  it('stops migration on normalized legacy email conflicts without merging or changing accounts', async () => {
    const { other } = await fixture()
    const preflight = readFileSync('server/infrastructure/database/migrations/0043_platform_clients.sql', 'utf8').split('--> statement-breakpoint')[0]!
    const error = await db.transaction(async tx => {
      await tx.execute(querySql`DROP INDEX users_email_unique`)
      await tx.insert(tables.users).values({ organizationId: other.id, name: 'Duplicate', email: ' ADMIN@EXAMPLE.COM ', passwordHash: 'hash' })
      await tx.execute(querySql.raw(preflight))
    }).catch(cause => cause)
    expect(error.cause.message).toContain('Resolve duplicate user emails before migration: admin@example.com')
    expect(await db.query.users.findMany()).toHaveLength(1)
    await expect(db.insert(tables.users).values({ organizationId: other.id, name: 'Duplicate', email: 'ADMIN@EXAMPLE.COM', passwordHash: 'hash' })).rejects.toThrow()
  })
  it('enforces the database-wide normalized email constraint and the rate limit', async () => {
    const { client } = await fixture()
    await expect(db.insert(tables.users).values({ organizationId: client.id, name: 'Duplicate', email: ' ADMIN@EXAMPLE.COM ', passwordHash: 'hashed' })).rejects.toThrow()
    for (let i = 0; i < 10; i++) await registration.limitRegistration('test-ip')
    await expect(registration.limitRegistration('test-ip')).rejects.toMatchObject({ statusCode: 429 })
  })
  async function apartmentFixture(organizationId: string) {
    const [hotel] = await db.insert(tables.hotels).values({ organizationId, name: 'Same Hotel', address: 'Address', latitude: '42', longitude: '23' }).returning()
    const [type] = await db.insert(tables.apartmentTypes).values({ organizationId, name: 'Same Type', ownerTotalEur: 0, cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0 }).returning()
    const [apartment] = await db.insert(tables.apartments).values({ organizationId, hotelId: hotel!.id, apartmentTypeId: type!.id, name: 'A1', capacity: 2, rooms: 1, checkInTime: '14:00', checkOutTime: '11:00' }).returning()
    return { hotel: hotel!, apartment: apartment! }
  }
  it('isolates lists, lookup, edits and deletion when two clients have identically named hotels', async () => {
    const { client, other, principal } = await fixture()
    const own = await apartmentFixture(client.id); const foreign = await apartmentFixture(other.id)
    const hotels = await import('../server/modules/hotel/hotel.service')
    expect((await hotels.listHotels(principal)).map(hotel => hotel.id)).toEqual([own.hotel.id])
    expect(await actors.canManageApartment(principal, foreign.apartment.id)).toBe(false)
    await expect(hotels.getHotel(principal, foreign.hotel.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(hotels.updateHotel(principal, foreign.hotel.id, { name: 'Changed', address: 'Address', latitude: 42, longitude: 23 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(hotels.deleteHotel(principal, foreign.hotel.id)).rejects.toMatchObject({ statusCode: 404 })
    expect((await db.query.hotels.findFirst({ where: eq(tables.hotels.id, foreign.hotel.id) }))!.name).toBe('Same Hotel')
  })
  it('skips blocked background feeds and rechecks status after fetching a feed', async () => {
    const { client, user } = await fixture()
    const { apartment } = await apartmentFixture(client.id)
    const [feed] = await db.insert(tables.icalFeeds).values({ organizationId: client.id, apartmentId: apartment.id, url: 'https://example.com/feed', createdById: user.id }).returning()
    const ical = await import('../server/modules/calendar-import/ical.service')
    await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, client.id))
    expect(await ical.syncIcalFeed(feed!.id)).toEqual({ skipped: true }); expect(fetchIcal).not.toHaveBeenCalled()
    await db.update(tables.organizations).set({ status: 'active' }).where(eq(tables.organizations.id, client.id))
    vi.mocked(fetchIcal).mockImplementationOnce(async () => {
      await db.update(tables.organizations).set({ status: 'blocked' }).where(eq(tables.organizations.id, client.id))
      return [{ uid: 'booking', checkInOn: '2026-10-04', checkOutOn: '2026-10-06', summary: '' }]
    })
    expect(await ical.syncIcalFeed(feed!.id)).toEqual({ skipped: true })
    expect(await db.query.stays.findMany()).toHaveLength(0)
    expect((await db.query.icalFeeds.findFirst())!.lastSyncedAt).toBeNull()
  })
  it('does not reactivate invited accounts through password tokens while the client is blocked', async () => {
    const { principal } = await fixture(true)
    const client = await platform.createClient(principal, { name: 'Client', timezone: 'Europe/Sofia', administratorName: 'Admin', email: 'invited@example.com' })
    const token = vi.mocked(sendAccountLink).mock.calls.at(-1)![0].token
    await platform.updateClient(principal, client.id, { status: 'blocked' })
    await expect(accounts.setPassword(token, 'new-password')).rejects.toMatchObject({ statusCode: 400 })
    expect((await db.query.users.findFirst({ where: eq(tables.users.email, 'invited@example.com') }))!.status).toBe('invited')
    expect((await db.query.authTokens.findFirst())!.usedAt).toBeNull()
    await platform.updateClient(principal, client.id, { status: 'active' })
    await accounts.setPassword(token, 'new-password')
    expect((await db.query.users.findFirst({ where: eq(tables.users.email, 'invited@example.com') }))!.status).toBe('active')
  })
  it('allows cross-client authorship only for a real superuser', async () => {
    const { client, other, user } = await fixture(true)
    const { apartment } = await apartmentFixture(other.id)
    const [ordinary] = await db.insert(tables.users).values({ organizationId: client.id, name: 'Ordinary', email: 'ordinary@example.com', passwordHash: 'hash' }).returning()
    const task = { organizationId: other.id, apartmentId: apartment.id, title: 'Support task' }
    await expect(db.insert(tables.tasks).values({ ...task, createdById: ordinary!.id })).rejects.toThrow()
    const [created] = await db.insert(tables.tasks).values({ ...task, createdById: user.id }).returning()
    expect(created!.createdById).toBe(user.id)
    await db.update(tables.users).set({ isSuperuser: false }).where(eq(tables.users.id, user.id))
    await db.update(tables.tasks).set({ title: 'Updated support task' }).where(eq(tables.tasks.id, created!.id))
    expect((await db.query.tasks.findFirst({ where: eq(tables.tasks.id, created!.id) }))!.title).toBe('Updated support task')
    await expect(db.update(tables.users).set({ organizationId: other.id }).where(eq(tables.users.id, ordinary!.id))).rejects.toThrow()
  })
  it('blocks cross-client parent and assignee references, including child tables without organizationId', async () => {
    const { client, other, user } = await fixture()
    const [hotel] = await db.insert(tables.hotels).values({ organizationId: client.id, name: 'Hotel', address: 'Address', latitude: '42', longitude: '23' }).returning()
    const [type] = await db.insert(tables.apartmentTypes).values({ organizationId: client.id, name: 'Type', ownerTotalEur: 0, cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0 }).returning()
    const apartment = { organizationId: client.id, hotelId: hotel!.id, apartmentTypeId: type!.id, name: 'A1', capacity: 2, rooms: 1, checkInTime: '14:00', checkOutTime: '11:00' }
    await expect(db.insert(tables.apartments).values({ ...apartment, organizationId: other.id })).rejects.toThrow()
    const [ownApartment] = await db.insert(tables.apartments).values(apartment).returning()
    const [foreignConsumable] = await db.insert(tables.consumables).values({ organizationId: other.id, name: 'Item', category: 'General', unit: 'шт' }).returning()
    await expect(db.insert(tables.inventoryLots).values({ apartmentId: ownApartment!.id, consumableId: foreignConsumable!.id, remainingQuantity: '1', unitCostEur: 1 })).rejects.toThrow()
    const [foreignUser] = await db.insert(tables.users).values({ organizationId: other.id, name: 'Cleaner', email: 'cleaner@example.com', passwordHash: 'hashed', roles: ['cleaner'] }).returning()
    await expect(db.insert(tables.tasks).values({ organizationId: client.id, apartmentId: ownApartment!.id, title: 'Task', createdById: user.id, assigneeId: foreignUser!.id })).rejects.toThrow()
  })
})
