import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createError, createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { eq, sql as querySql } from 'drizzle-orm'
import { fetchIcal } from '../server/modules/calendar-import/ical'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as tables from '../server/infrastructure/database/schema'
import { sendAccountLink, sendRegistrationLink } from '../server/infrastructure/mail/send'

vi.mock('../server/modules/calendar-import/ical', () => ({ fetchIcal: vi.fn() }))
vi.mock('../server/infrastructure/mail/send', () => ({ sendAccountLink: vi.fn(), sendRegistrationLink: vi.fn() }))
const url = process.env.PLATFORM_TEST_DATABASE_URL
let db: typeof import('../server/infrastructure/database/client').db
let connection: typeof import('../server/infrastructure/database/client').sql
let registration: typeof import('../server/modules/auth/registration.service')
let platform: typeof import('../server/modules/platform/platform.service')
let auth: typeof import('../server/infrastructure/auth/platform')
let actors: typeof import('../server/infrastructure/auth/actor')
let accounts: typeof import('../server/modules/auth/account.service')
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
  }, 30000)
  afterAll(async () => { vi.unstubAllGlobals(); await connection?.end() })
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(fetchIcal).mockResolvedValue([])
    vi.mocked(sendAccountLink).mockResolvedValue(undefined)
    vi.mocked(sendRegistrationLink).mockResolvedValue(undefined)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('hashPassword', async (password: string) => `hashed:${password}`)
    vi.stubGlobal('requireUserSession', async () => ({ user: sessionUser }))
    vi.stubGlobal('getUserSession', async () => ({ user: sessionUser }))
    // Renewal transport is separately covered by auth-session.spec.ts.
    vi.stubGlobal('setUserSession', async () => undefined)
    vi.stubGlobal('useRuntimeConfig', () => ({ session: { password: 'platform-test-password-more-than-32-chars' }, public: {} }))
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
  const registrationInput = { companyName: 'New Company', name: 'New Admin', email: 'new@example.com', password: 'password123' }
  async function openRegistration() { await db.update(tables.systemSettings).set({ registrationMode: 'self_service' }) }
  function lastToken() { return vi.mocked(sendRegistrationLink).mock.calls.at(-1)![0].token }

  it('defaults to closed registration, including confirmation and resend', async () => {
    expect(await registration.registrationMode()).toBe('superuser_only')
    await expect(registration.registerCompany(registrationInput)).rejects.toMatchObject({ statusCode: 403 })
    await expect(registration.resendRegistration('new@example.com')).rejects.toMatchObject({ statusCode: 403 })
    await expect(registration.confirmRegistration('not-a-valid-token')).rejects.toMatchObject({ statusCode: 403 })
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
  it('scopes notification recipients and suppresses delivery for blocked clients', async () => {
    const { client, other, user } = await fixture()
    const [foreign] = await db.insert(tables.users).values({ organizationId: other.id, name: 'Other Admin', email: 'foreign@example.com', passwordHash: 'hash', status: 'active', roles: ['administrator'] }).returning()
    const notifications = await import('../server/infrastructure/notification/publish')
    const input = { organizationId: client.id, userIds: [user.id, foreign!.id], type: 'manual' as const, title: 'Title', body: 'Body', href: null }
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
