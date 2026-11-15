import { createHash, randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as h3 from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as tables from '../server/infrastructure/database/schema'
import type { Actor } from '../server/infrastructure/auth/actor'
import { chatgptCallback, chatgptClientId, claudeCallback, claudeClientId } from '../server/modules/ai-agents/oauth-config'
import { geminiClientPrefix } from '../server/modules/ai-agents/gemini-client'

const databaseUrl = process.env.AI_AGENTS_TEST_DATABASE_URL
const issuer = 'https://crm.example.test'
const resource = issuer + '/mcp'
const dates = { from: '2026-12-05', to: '2026-12-05' }

describe.skipIf(!databaseUrl)('AI agent MCP with PostgreSQL', () => {
  let database: typeof import('../server/infrastructure/database/client')
  let grants: typeof import('../server/modules/ai-agents/grants')
  let request: ReturnType<typeof h3.toWebHandler>
  let admin: Actor
  let manager: Actor
  let cleaner: Actor
  let ownApartment: string
  let otherApartment: string
  let foreignApartment: string
  let departing: string

  beforeAll(async () => {
    if (new URL(databaseUrl!).pathname !== '/aparts_ai_agents_test') throw new Error('Use only the disposable aparts_ai_agents_test database')
    vi.stubEnv('DATABASE_URL', databaseUrl)
    for (const key of ['createError', 'defineEventHandler', 'getHeader', 'getMethod', 'getQuery', 'sendNoContent', 'setResponseHeader', 'setResponseHeaders', 'setResponseStatus'] as const) {
      vi.stubGlobal(key, h3[key])
    }
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl: issuer }, session: { password: 'only-used-by-this-local-test-fixture' } }))
    vi.stubGlobal('fetch', (url: string) => {
      if (url !== chatgptClientId && url !== claudeClientId) throw new Error('Unexpected outbound request')
      return Promise.resolve(Response.json({
        client_id: url, redirect_uris: [url === claudeClientId ? claudeCallback : chatgptCallback],
        grant_types: ['authorization_code', 'refresh_token'],
        ...(url === claudeClientId ? { token_endpoint_auth_method: 'none' } : { token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'] })
      }))
    })
    database = await import('../server/infrastructure/database/client')
    grants = await import('../server/modules/ai-agents/grants')
    const { db } = database
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql`CREATE SCHEMA public`)
    await migrate(db, { migrationsFolder: 'server/infrastructure/database/migrations' })

    const [organization, foreign] = await db.insert(tables.organizations)
      .values([{ name: 'Aparts test' }, { name: 'Other tenant' }]).returning()
    expect(organization!.aiAgentsEnabled).toBe(false)
    await db.update(tables.organizations).set({ aiAgentsEnabled: true }).where(eq(tables.organizations.id, organization!.id))
    const member = (name: string, roles: Actor['roles']) => ({
      organizationId: organization!.id, name, roles, email: `${name}@example.test`, passwordHash: 'unused', status: 'active' as const
    })
    const members = await db.insert(tables.users).values([
      member('admin', ['administrator']), member('manager', ['manager']), member('cleaner', ['cleaner'])
    ]).returning()
    ;[admin, manager, cleaner] = members as [Actor, Actor, Actor]

    async function apartment(organizationId: string, name: string) {
      const [hotel] = await db.insert(tables.hotels).values({ organizationId, name, address: 'Test', latitude: '0', longitude: '0' }).returning()
      const [type] = await db.insert(tables.apartmentTypes).values({ organizationId, name: 'Studio',
        ownerTotalEur: 0, cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0 }).returning()
      const [row] = await db.insert(tables.apartments).values({ organizationId, hotelId: hotel!.id,
        apartmentTypeId: type!.id, name, capacity: 2, rooms: 1, checkInTime: '15:00', checkOutTime: '11:00' }).returning()
      return row!.id
    }

    ownApartment = await apartment(admin.organizationId, 'Managed')
    otherApartment = await apartment(admin.organizationId, 'Other')
    foreignApartment = await apartment(foreign!.id, 'Foreign')
    await db.insert(tables.apartmentManagers).values({ organizationId: admin.organizationId, apartmentId: ownApartment, userId: manager.id })
    const booking = (organizationId: string, apartmentId: string, checkInOn: string, checkOutOn: string) => ({
      organizationId, apartmentId, checkInOn, checkOutOn, adultCount: 1, childCount: 0,
      guestName: 'Private guest', guestPhone: '555', guestEmail: 'guest@example.test', cashAmountEur: 50
    })
    const [departure] = await db.insert(tables.stays).values([
      booking(admin.organizationId, ownApartment, '2026-12-01', '2026-12-05'),
      booking(admin.organizationId, ownApartment, '2026-12-05', '2026-12-07'),
      booking(admin.organizationId, otherApartment, '2026-12-01', '2026-12-05'),
      booking(foreign!.id, foreignApartment, '2026-12-01', '2026-12-05')
    ]).returning()
    departing = departure!.id
    const clean = (apartmentId: string, stayId?: string) => ({
      organizationId: admin.organizationId, apartmentId, stayId, scheduledOn: dates.from,
      tariffSnapshot: { ownerTotalEur: 0, cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0 }
    })
    const [assigned] = await db.insert(tables.cleanings).values([clean(ownApartment, departing), clean(otherApartment)]).returning()
    await db.insert(tables.cleaningAssignments).values({ cleaningId: assigned!.id, cleanerId: cleaner.id, routePosition: 1 })

    const [platformSession] = await db.insert(tables.platformSessions).values({
      userId: admin.id, organizationId: admin.organizationId, expiresAt: new Date(Date.now() + 600_000)
    }).returning()
    const { SESSION_VERSION } = await import('../server/infrastructure/auth/platform')
    vi.stubGlobal('requireUserSession', (event: h3.H3Event) => {
      if (h3.getHeader(event, 'cookie') !== 'test-session=valid') throw h3.createError({ statusCode: 401 })
      return { user: { id: admin.id, platformSessionId: platformSession!.id, sessionVersion: SESSION_VERSION } }
    })
    const app = h3.createApp()
    app.use('/.well-known/oauth-authorization-server', (await import('../server/routes/.well-known/oauth-authorization-server.get')).default)
    app.use('/.well-known/oauth-protected-resource/mcp', (await import('../server/routes/.well-known/oauth-protected-resource/mcp.get')).default)
    const consentGet = (await import('../server/api/ai-agents/consent.get')).default
    const consentPost = (await import('../server/api/ai-agents/consent.post')).default
    app.use('/api/ai-agents/consent', h3.defineEventHandler(event =>
      h3.getMethod(event) === 'GET' ? consentGet(event) : consentPost(event)))
    app.use('/mcp', (await import('../server/routes/mcp')).default)
    app.use('/oauth/ai-agents/token', (await import('../server/routes/oauth/ai-agents/token.post')).default)
    app.use('/oauth/ai-agents/register', (await import('../server/routes/oauth/ai-agents/register.post')).default)
    request = h3.toWebHandler(app)
  }, 20_000)

  afterAll(async () => {
    await database?.sql.end()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  async function codeFor(actor: Actor, permissions: string[]) {
    const verifier = randomBytes(32).toString('base64url')
    const code = await grants.grantCode(actor, {
      client_id: chatgptClientId, redirect_uri: chatgptCallback, resource, response_type: 'code', state: 'test',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    }, permissions)
    return { grant_type: 'authorization_code', code, client_id: chatgptClientId, code_verifier: verifier, redirect_uri: chatgptCallback, resource }
  }

  function tokenExchange(fields: Record<string, string>) {
    return request(new Request(issuer + '/oauth/ai-agents/token', { method: 'POST', body: new URLSearchParams(fields) }))
  }

  async function connect(actor: Actor, permissions: string[]) {
    const response = await tokenExchange(await codeFor(actor, permissions))
    expect(response.status).toBe(200)
    return await response.json() as { access_token: string; refresh_token: string }
  }

  function mcp(token?: string, method = 'tools/list', params?: unknown) {
    const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' })
    if (token) headers.set('Authorization', 'Bearer ' + token)
    return request(new Request(resource, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }))
  }

  async function callTool(token: string, name: string, args: object) {
    const response = await mcp(token, 'tools/call', { name, arguments: args })
    expect(response.status).toBe(200)
    return (await response.json()).result
  }

  it('advertises OAuth and requires a signed-in user and same-origin consent before issuing a code', async () => {
    const protectedResource = await request(new Request(issuer + '/.well-known/oauth-protected-resource/mcp'))
    expect(await protectedResource.json()).toMatchObject({ resource, authorization_servers: [issuer] })
    const oauth = await request(new Request(issuer + '/.well-known/oauth-authorization-server'))
    const metadata = await oauth.json()
    expect(metadata).toMatchObject({
      issuer, client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true
    })

    const verifier = randomBytes(32).toString('base64url')
    const authorizationRequest = {
      client_id: chatgptClientId, redirect_uri: chatgptCallback, resource,
      response_type: 'code', state: 'consent-state',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    }
    const api = issuer + '/api/ai-agents/consent'
    const preview = api + '?' + new URLSearchParams(authorizationRequest)
    expect((await request(new Request(preview))).status).toBe(401)
    const cookie = 'test-session=valid'
    const session = await request(new Request(preview, { headers: { cookie } }))
    expect(session.status).toBe(200)
    const { organizationName, userId, organizationId, permissions } = await session.json()
    const confirmed = { userId, organizationId, permissions }
    expect(organizationName).toBe('Aparts test')
    expect(confirmed.permissions).toEqual(['bookings', 'cleanings', 'tasks'])
    const submit = (decision: 'allow' | 'deny', origin = issuer) => request(new Request(api, {
      method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...confirmed, request: authorizationRequest, decision })
    }))
    expect((await submit('allow', 'https://elsewhere.example.test')).status).toBe(403)
    const denial = new URL((await (await submit('deny')).json()).redirect)
    expect(Object.fromEntries(denial.searchParams)).toEqual({ state: 'consent-state', iss: issuer, error: 'access_denied' })
    const approval = new URL((await (await submit('allow')).json()).redirect)
    expect(approval.origin + approval.pathname).toBe(chatgptCallback)
    expect(approval.searchParams.get('iss')).toBe(issuer)
    const response = await tokenExchange({
      grant_type: 'authorization_code', client_id: chatgptClientId, redirect_uri: chatgptCallback,
      resource, code: approval.searchParams.get('code')!, code_verifier: verifier
    })
    expect(response.status).toBe(200)
    expect(await grants.currentConnection(admin, resource)).toMatchObject({ permissions: ['bookings', 'cleanings', 'tasks'] })
  })

  it('authorizes Claude independently and revokes only its connection and pending codes', async () => {
    const chatgpt = await connect(admin, ['bookings'])
    const verifier = randomBytes(32).toString('base64url')
    const authorizationRequest = {
      client_id: claudeClientId, redirect_uri: claudeCallback, response_type: 'code', state: 'claude-consent',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    }
    const api = issuer + '/api/ai-agents/consent'
    const cookie = 'test-session=valid'
    const preview = (fields: Record<string, string>) => request(new Request(api + '?' + new URLSearchParams(fields), { headers: { cookie } }))
    expect((await preview({ ...authorizationRequest, redirect_uri: chatgptCallback })).status).toBe(400)
    expect((await preview({ ...authorizationRequest, resource: 'https://another-crm.example.test/mcp' })).status).toBe(400)
    const consent = await preview(authorizationRequest)
    expect(consent.status).toBe(200)
    const { userId, organizationId, permissions, provider, callbackHost } = await consent.json()
    expect({ provider, callbackHost }).toEqual({ provider: 'claude', callbackHost: 'claude.ai' })
    const authorize = async () => {
      const response = await request(new Request(api, {
        method: 'POST', headers: { origin: issuer, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, permissions, request: authorizationRequest, decision: 'allow' })
      }))
      expect(response.status).toBe(200)
      const callback = new URL((await response.json()).redirect)
      expect(callback.origin + callback.pathname).toBe(claudeCallback)
      expect(callback.searchParams.get('state')).toBe('claude-consent')
      return {
        grant_type: 'authorization_code', client_id: claudeClientId, redirect_uri: claudeCallback,
        code: callback.searchParams.get('code')!, code_verifier: verifier
      }
    }
    const tokenResponse = await tokenExchange(await authorize())
    expect(tokenResponse.status).toBe(200)
    const { access_token, refresh_token } = await tokenResponse.json()
    expect((await mcp(access_token)).status).toBe(200)
    expect((await tokenExchange({ grant_type: 'refresh_token', client_id: chatgptClientId, refresh_token })).status).toBe(400)
    const refreshed = await tokenExchange({ grant_type: 'refresh_token', client_id: claudeClientId, refresh_token })
    expect(refreshed.status).toBe(200)
    const newToken = (await refreshed.json()).access_token
    const pendingClaude = await authorize()
    await grants.revokeConnection(admin, claudeClientId)
    expect((await tokenExchange(pendingClaude)).status).toBe(400)
    expect((await mcp(newToken)).status).toBe(401)
    expect((await mcp(chatgpt.access_token)).status).toBe(200)
  })

  it('uses PKCE, rotates credentials, pauses without revoking, and rejects revoked or blocked access', async () => {
    const unauthenticated = await mcp()
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp')
    const codeGrant = await codeFor(admin, ['bookings', 'cleanings'])
    expect((await tokenExchange({ ...codeGrant, code_verifier: randomBytes(32).toString('base64url') })).status).toBe(400)
    const response = await tokenExchange(codeGrant)
    expect(response.status).toBe(200)
    const { access_token, refresh_token } = await response.json()
    expect((await tokenExchange(codeGrant)).status).toBe(400)
    const refresh = { grant_type: 'refresh_token', client_id: chatgptClientId, refresh_token }
    expect((await tokenExchange({ ...refresh, resource: 'https://another-crm.example.test/mcp' })).status).toBe(400)
    const pending = await codeFor(admin, ['bookings'])
    const org = eq(tables.organizations.id, admin.organizationId)
    await database.db.update(tables.organizations).set({ aiAgentsEnabled: false }).where(org)
    expect((await mcp(access_token)).status).toBe(503)
    expect((await tokenExchange(refresh)).status).toBe(503)
    expect((await tokenExchange(pending)).status).toBe(503)
    await expect(codeFor(admin, ['bookings'])).rejects.toMatchObject({ reason: 'paused' })
    await database.db.update(tables.organizations).set({ aiAgentsEnabled: true }).where(org)
    expect((await mcp(access_token)).status).toBe(200)
    const rotated = await tokenExchange(refresh)
    expect(rotated.status).toBe(200)
    expect((await tokenExchange(refresh)).status).toBe(400)
    expect((await mcp(access_token)).status).toBe(401)
    const newToken = (await rotated.json()).access_token
    await grants.revokeConnection(admin)
    expect((await mcp(newToken)).status).toBe(401)
    expect((await tokenExchange(pending)).status).toBe(400)
    const replacement = await connect(admin, ['bookings', 'cleanings'])
    await database.db.update(tables.users).set({ status: 'blocked' }).where(eq(tables.users.id, admin.id))
    expect((await mcp(replacement.access_token)).status).toBe(401)
    await database.db.update(tables.users).set({ status: 'active' }).where(eq(tables.users.id, admin.id))
  })

  it('registers Gemini for an exact Google callback and keeps its consent and revocation independent', async () => {
    const chatgpt = await connect(admin, ['bookings'])
    const oauth = await request(new Request(issuer + '/.well-known/oauth-authorization-server'))
    const { registration_endpoint } = await oauth.json()
    const callback = 'https://oauth-redirect.googleusercontent.com/r/crm-test'
    const register = (redirect: string) => request(new Request(registration_endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [redirect], token_endpoint_auth_method: 'client_secret_basic' })
    }))
    expect((await register('https://not-google.example.test/r/crm-test')).status).toBe(400)
    const registration = await register(callback)
    expect(registration.status).toBe(201)
    const { client_id, client_secret } = await registration.json()
    const verifier = randomBytes(32).toString('base64url')
    const authorizationRequest = {
      client_id, redirect_uri: callback, response_type: 'code', state: 'gemini-consent', scope: 'crm:read',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    }
    const api = issuer + '/api/ai-agents/consent'
    const cookie = 'test-session=valid'
    const preview = (fields: Record<string, string>) => request(new Request(api + '?' + new URLSearchParams(fields), { headers: { cookie } }))
    expect((await preview({ ...authorizationRequest, redirect_uri: callback + '-different' })).status).toBe(400)
    const consent = await preview(authorizationRequest)
    expect(consent.status).toBe(200)
    const { provider, userId, organizationId, permissions } = await consent.json()
    expect(provider).toBe('gemini')
    const approval = await request(new Request(api, {
      method: 'POST', headers: { origin: issuer, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ userId, organizationId, permissions, request: authorizationRequest, decision: 'allow' })
    }))
    expect(approval.status).toBe(200)
    const redirect = new URL((await approval.json()).redirect)
    expect(redirect.origin + redirect.pathname).toBe(callback)
    const fields = {
      grant_type: 'authorization_code', redirect_uri: callback,
      code: redirect.searchParams.get('code')!, code_verifier: verifier
    }
    const exchange = (params: Record<string, string>, secret = client_secret) => request(new Request(issuer + '/oauth/ai-agents/token', {
      method: 'POST', body: new URLSearchParams(params),
      headers: { authorization: 'Basic ' + Buffer.from(client_id + ':' + secret).toString('base64') }
    }))
    expect((await exchange(fields, 'wrong-secret')).status).toBe(401)
    const issued = await exchange(fields)
    expect(issued.status).toBe(200)
    const { access_token, refresh_token } = await issued.json()
    expect((await mcp(access_token)).status).toBe(200)
    expect(await grants.currentConnection(admin, resource, geminiClientPrefix)).toMatchObject({ permissions: ['bookings', 'cleanings', 'tasks'] })
    await grants.revokeConnection(admin, geminiClientPrefix)
    expect(await grants.currentConnection(admin, resource, geminiClientPrefix)).toBeNull()
    expect((await exchange({ grant_type: 'refresh_token', refresh_token })).status).toBe(400)
    expect((await mcp(access_token)).status).toBe(401)
    expect((await mcp(chatgpt.access_token)).status).toBe(200)
  })

  it('keeps records and linked IDs within live permissions and uses half-open availability', async () => {
    const { access_token: token } = await connect(admin, ['bookings', 'cleanings'])
    const { result: { tools } } = await (await mcp(token)).json()
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual([
      'list_bookings', 'get_availability', 'list_cleanings', 'get_daily_operations', 'get_operations_analytics'
    ])

    const departures = (cursor?: string) => callTool(token, 'list_bookings', { ...dates, mode: 'departures', limit: 1, cursor })
    const first = (await departures()).structuredContent
    const second = (await departures(first.nextCursor)).structuredContent
    expect(second.nextCursor).toBeNull()
    expect([...first.items, ...second.items].map(row => row.apartment.id).sort()).toEqual([ownApartment, otherApartment].sort())
    expect([...first.items, ...second.items].find(row => row.id === departing)).toEqual({
      id: departing, apartment: { id: ownApartment, name: 'Managed' }, checkInOn: '2026-12-01', checkOutOn: dates.from, state: 'active'
    })
    expect((await callTool(token, 'get_availability', { ...dates, to: '2026-12-06' })).structuredContent.items)
      .toEqual([{ id: otherApartment, name: 'Other' }])
    expect((await callTool(token, 'list_cleanings', dates)).structuredContent.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: departing })]))

    const { access_token: managerToken } = await connect(manager, ['bookings'])
    const bookings = (apartmentId?: string) => callTool(managerToken, 'list_bookings', { ...dates, mode: 'departures', apartmentId })
    expect((await bookings()).structuredContent.items).toHaveLength(1)
    expect((await bookings(foreignApartment)).structuredContent.items).toEqual([])
    expect((await bookings(otherApartment)).structuredContent.items).toEqual([])
    expect((await callTool(managerToken, 'list_cleanings', dates)).isError).toBe(true)
    await database.db.delete(tables.apartmentManagers).where(eq(tables.apartmentManagers.userId, manager.id))
    expect((await bookings()).structuredContent.items).toEqual([])

    const { access_token: cleanerToken } = await connect(cleaner, ['cleanings'])
    expect((await callTool(cleanerToken, 'list_cleanings', dates)).structuredContent.items)
      .toEqual([expect.objectContaining({ apartment: { id: ownApartment, name: 'Managed' }, bookingId: null })])
    expect((await callTool(cleanerToken, 'list_bookings', dates)).isError).toBe(true)
  })
  it('reports connection diagnostics for one organization without account or credential details', async () => {
    const { getClientHelp } = await import('../server/modules/platform/client-help')
    await connect(admin, ['bookings', 'cleanings'])
    const details = await getClientHelp(admin.organizationId, issuer, resource)
    const supported = details.members.find(member => member.id === admin.id)
    expect(supported).toEqual({ id: admin.id, name: admin.name, roles: ['administrator'], status: 'active', agentState: 'connected' })

    const [foreign] = await database.db.select({ id: tables.organizations.id })
      .from(tables.organizations).where(eq(tables.organizations.name, 'Other tenant'))
    expect((await getClientHelp(foreign!.id, issuer, resource)).members).toEqual([])

    await database.db.update(tables.organizations).set({ aiAgentsEnabled: false }).where(eq(tables.organizations.id, admin.organizationId))
    try {
      const paused = await getClientHelp(admin.organizationId, issuer, resource)
      expect(paused.members.find(member => member.id === admin.id)?.agentState).toBe('paused')
    } finally {
      await database.db.update(tables.organizations).set({ aiAgentsEnabled: true }).where(eq(tables.organizations.id, admin.organizationId))
    }
  })

  it('links daily priorities, paginates details and keeps task data opt-in and assignment scoped', async () => {
    const { db } = database
    const [ordinary] = await db.insert(tables.tasks).values([
      { organizationId: admin.organizationId, apartmentId: ownApartment, createdById: admin.id, assigneeId: cleaner.id,
        dueOn: dates.from, title: 'Check the lock', description: 'Private task description' },
      { organizationId: admin.organizationId, apartmentId: otherApartment, createdById: admin.id,
        dueOn: dates.from, title: 'Unassigned work' },
      { organizationId: admin.organizationId, apartmentId: ownApartment, createdById: admin.id, assigneeId: cleaner.id,
        dueOn: dates.from, category: 'cash', title: 'Private cash task' },
      { organizationId: admin.organizationId, apartmentId: ownApartment, createdById: admin.id, assigneeId: cleaner.id,
        dueOn: '2000-01-01', title: 'Unfinished old task' }
    ]).returning()
    const { access_token: oldToken } = await connect(admin, ['bookings', 'cleanings'])
    const original = (await callTool(oldToken, 'get_daily_operations', { date: dates.from })).structuredContent
    expect(original.totals.tasks).toBeNull()
    expect(original.items).toContainEqual(expect.objectContaining({
      kind: 'arrival',
      issues: [
        expect.objectContaining({ reason: 'preparation_unconfirmed', href: expect.stringContaining(issuer + '/calendar?stay=') }),
        expect.objectContaining({ reason: 'same_day_turnover' })
      ]
    }))
    const { access_token: adminToken } = await connect(admin, ['bookings', 'cleanings', 'tasks'])
    const first = (await callTool(adminToken, 'get_daily_operations', { date: dates.from, limit: 1 })).structuredContent
    expect(first.totals.tasks).toEqual({ due: 2, overdue: 0 })
    expect(first.items).toHaveLength(1)
    const rest = (await callTool(adminToken, 'get_daily_operations', { date: dates.from, cursor: first.nextCursor })).structuredContent
    expect(rest.totals).toEqual(first.totals)
    expect(rest.items).not.toContainEqual(first.items[0])
    expect(rest.items).toContainEqual(expect.objectContaining({ id: ordinary!.id, href: issuer + '/tasks/' + ordinary!.id }))
    expect(JSON.stringify(rest)).not.toMatch(/Private task description|Private cash task|Private guest/)
    const { access_token: cleanerToken } = await connect(cleaner, ['tasks'])
    const day = (await callTool(cleanerToken, 'get_daily_operations', { date: dates.from })).structuredContent
    expect(day.totals).toEqual({ bookings: null, cleanings: null, tasks: { due: 1, overdue: 0 } })
    expect(day.items.map((item: { id: string }) => item.id)).toEqual([ordinary!.id])
    const today = (await callTool(cleanerToken, 'get_daily_operations', {})).structuredContent
    expect(today.items).toContainEqual(expect.objectContaining({
      title: 'Unfinished old task', issues: [expect.objectContaining({ reason: 'overdue' })]
    }))
  })

  it('counts distinct apartment nights, groups clipped periods and allows owners to open only their own bookings', async () => {
    const { db } = database
    await db.insert(tables.apartmentManagers).values({ organizationId: admin.organizationId, apartmentId: ownApartment, userId: manager.id })
    const [overlap] = await db.insert(tables.stays).values({
      organizationId: admin.organizationId, apartmentId: ownApartment, checkInOn: '2026-12-04', checkOutOn: '2026-12-06',
      adultCount: 1, childCount: 0, guestName: 'Private overlapping guest'
    }).returning()
    const { access_token: managerToken } = await connect(manager, ['bookings'])
    const period = { from: '2026-12-04', to: '2026-12-07' }
    const analyze = async (args: object) => (await callTool(managerToken, 'get_operations_analytics', args)).structuredContent
    const daily = await analyze(period)
    expect(daily).toMatchObject({ grouping: 'day', totals: {
      bookings: { arrivals: 2, departures: 3, eligibleNights: 4, bookedNights: 3, occupancyPercent: 75 },
      cleanings: null, tasks: null
    } })
    expect((await analyze({ ...period, apartmentId: otherApartment })).totals.bookings)
      .toEqual({ arrivals: 0, departures: 0, bookedNights: 0, eligibleNights: 0, occupancyPercent: null })
    const week = await analyze({ from: '2026-12-02', to: '2027-01-03' })
    expect(week).toMatchObject({ grouping: 'week', series: [{ from: '2026-12-02', to: '2026-12-06' },
      { from: '2026-12-07', to: '2026-12-13' }, { from: '2026-12-14', to: '2026-12-20' },
      { from: '2026-12-21', to: '2026-12-27' }, { from: '2026-12-28', to: '2027-01-03' }] })
    const months = await analyze({ from: '2026-12-04', to: '2027-04-01' })
    expect(months.grouping).toBe('month')
    expect(months.series.at(-1)).toMatchObject({ from: '2027-04-01', to: '2027-04-01' })
    const day = (await callTool(managerToken, 'get_daily_operations', { date: dates.from })).structuredContent
    expect(day.items).toContainEqual(expect.objectContaining({
      id: overlap!.id, href: issuer + '/calendar?stay=' + overlap!.id,
      issues: [expect.objectContaining({ reason: 'overlap' })]
    }))
    const { getStayDetails } = await import('../server/modules/stay/stay.service')
    expect(await getStayDetails(manager, overlap!.id)).toMatchObject({ id: overlap!.id })
    const otherStay = await db.query.stays.findFirst({ where: eq(tables.stays.apartmentId, otherApartment) })
    await expect(getStayDetails(manager, otherStay!.id)).rejects.toMatchObject({ statusCode: 404 })
  })

})
