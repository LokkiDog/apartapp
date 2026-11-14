import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createError } from 'h3'
import { and, eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as tables from '../server/infrastructure/database/schema'
import type { Actor } from '../server/infrastructure/auth/actor'

const url = process.env.MESSAGING_TEST_DATABASE_URL
let db: typeof import('../server/infrastructure/database/client').db
let connection: typeof import('../server/infrastructure/database/client').sql
let inbox: typeof import('../server/modules/messaging/conversations')
let telegram: typeof import('../server/modules/messaging/connection')
let incoming: typeof import('../server/modules/messaging/incoming')
let outbox: typeof import('../server/modules/messaging/outbox')
let platform: typeof import('../server/modules/platform/platform.service')
let directory: string
let actor: Actor
let other: Actor
let botConnection: typeof tables.messagingConnections.$inferSelect
let sequence = 0
const fetchMock = vi.fn()
const secretKey = 'a'.repeat(64)

function update(text = 'Hello', extra = {}) {
  return {
    update_id: ++sequence,
    message: {
      message_id: sequence,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123, type: 'private', first_name: 'Guest' },
      text,
      ...extra,
    },
  }
}
async function conversationId() {
  await incoming.receiveTelegramUpdate(
    botConnection.id,
    botConnection.webhookSecret,
    update(),
  )
  return (await inbox.listConversations(actor)).items[0]!.id
}

async function makeApartment(owner: Actor) {
  const [hotel] = await db
    .insert(tables.hotels)
    .values({
      organizationId: owner.organizationId,
      name: 'Hotel',
      address: 'Bansko',
      latitude: 41.8,
      longitude: 23.4,
    })
    .returning()
  const [type] = await db
    .insert(tables.apartmentTypes)
    .values({
      organizationId: owner.organizationId,
      name: 'Studio',
      ownerTotalEur: 0,
      cleanerPoolEur: 0,
      laundryEur: 0,
      serviceEur: 0,
    })
    .returning()
  const [apartment] = await db
    .insert(tables.apartments)
    .values({
      organizationId: owner.organizationId,
      hotelId: hotel!.id,
      apartmentTypeId: type!.id,
      name: '101',
      capacity: 2,
      rooms: 1,
      checkInTime: '14:00',
      checkOutTime: '11:00',
    })
    .returning()
  await db.insert(tables.apartmentManagers).values({
    organizationId: owner.organizationId, apartmentId: apartment!.id, userId: owner.id,
  })
  return apartment!
}

async function makeStay(owner: Actor) {
  const apartment = await makeApartment(owner)
  const [stay] = await db
    .insert(tables.stays)
    .values({
      organizationId: owner.organizationId,
      apartmentId: apartment!.id,
      checkInOn: '2026-12-01',
      checkOutOn: '2026-12-05',
      adultCount: 2,
      childCount: 0,
      guestName: 'Guest',
    })
    .returning()
  return stay!
}

// This suite only migrates and resets a disposable database with this exact name.
describe.skipIf(!url)('guest messaging PostgreSQL boundaries', () => {
  beforeAll(async () => {
    if (new URL(url!).pathname !== '/aparts_messaging_test')
      throw new Error('Use the isolated aparts_messaging_test database only')
    process.env.DATABASE_URL = url
    directory = await mkdtemp(join(tmpdir(), 'aparts-messaging-'))
    process.env.FILE_STORAGE_PATH = directory
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('useRuntimeConfig', () => ({
      messagingEncryptionKey: secretKey,
      public: { appUrl: 'https://crm.example.com' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const database = await import('../server/infrastructure/database/client')
    db = database.db
    connection = database.sql
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql`CREATE SCHEMA public`)
    await migrate(db, {
      migrationsFolder: 'server/infrastructure/database/migrations',
    })
    inbox = await import('../server/modules/messaging/conversations')
    telegram = await import('../server/modules/messaging/connection')
    incoming = await import('../server/modules/messaging/incoming')
    outbox = await import('../server/modules/messaging/outbox')
    platform = await import('../server/modules/platform/platform.service')
  })
  afterAll(async () => {
    if (connection) await connection.end()
    if (directory) await rm(directory, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE organizations CASCADE`)
    const [organization, second] = await db
      .insert(tables.organizations)
      .values([{ name: 'First' }, { name: 'Second' }])
      .returning()
    const users = await db
      .insert(tables.users)
      .values([
        {
          organizationId: organization!.id,
          name: 'Admin',
          email: 'admin@first.test',
          passwordHash: 'unused',
          status: 'active',
          roles: ['administrator'],
        },
        {
          organizationId: second!.id,
          name: 'Other',
          email: 'admin@second.test',
          passwordHash: 'unused',
          status: 'active',
          roles: ['administrator'],
        },
      ])
      .returning()
    actor = {
      id: users[0]!.id,
      organizationId: organization!.id,
      email: users[0]!.email,
      name: 'Admin',
      roles: ['administrator'],
      locale: 'ru',
      guestsEnabled: true,
    }
    other = { ...actor, id: users[1]!.id, organizationId: second!.id }
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/getMe'))
        return Response.json({
          ok: true,
          result: {
            id: 987,
            is_bot: true,
            username: 'test_bot',
            first_name: 'Hotel',
          },
        })
      return Response.json({ ok: true, result: true })
    })
    await platform.updateClient(
      { ...actor, isSuperuser: true },
      actor.organizationId,
      { messagingEnabled: true, guestsEnabled: true },
    )
    await platform.updateClient(
      { ...actor, isSuperuser: true },
      other.organizationId,
      { messagingEnabled: true, guestsEnabled: true },
    )
    await telegram.connectTelegram(actor, '123456:abcdefghijklmnopqrstuvwx')
    botConnection = (await db.select().from(tables.messagingConnections))[0]!
  })

  it('delivers a first-contact reply and only one after-hours reply for concurrent Telegram messages', async () => {
    const { defaultMessagingAutomation } = await import('../shared/contracts/messaging-automation')
    const settings = defaultMessagingAutomation()
    // Pick a working day two local dates away, so the test always runs outside working hours.
    const today = new Date().getUTCDay()
    settings.days = [(today + 1) % 7 + 1]
    settings.telegram = {
      welcome: { enabled: true, text: 'Welcome' },
      away: { enabled: true, text: 'We will reply during business hours.' },
    }
    await db.update(tables.organizations).set({ messagingAutomation: settings, timezone: 'UTC' })
      .where(eq(tables.organizations.id, actor.organizationId))
    const sent: string[] = []
    fetchMock.mockImplementation(async (url: string, request?: RequestInit) => {
      if (url.endsWith('/sendMessage')) {
        sent.push(JSON.parse(String(request?.body)).text)
        return Response.json({ ok: true, result: { message_id: 42 } })
      }
      return Response.json({ ok: true, result: true })
    })
    const first = update('/start')
    const receive = (payload: ReturnType<typeof update>) =>
      incoming.receiveTelegramUpdate(botConnection.id, botConnection.webhookSecret, payload)
    await Promise.all([receive(first), receive(first), receive(update('Hello'))])
    await outbox.processMessagingOutbox()
    expect(sent).toEqual(['Welcome\n\nWe will reply during business hours.'])
    const [{ id }] = (await inbox.listConversations(actor)).items
    expect((await inbox.listMessages(actor, id, undefined, 50)).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ direction: 'outgoing', status: 'sent', text: sent[0] }),
      ]),
    )
  })

  it('defaults new clients to off and permits only the super to enable the module', async () => {
    const [fresh] = await db
      .insert(tables.organizations)
      .values({ name: 'Default' })
      .returning()
    expect(fresh?.messagingEnabled).toBe(false)
    await expect(
      platform.updateClient(actor, fresh!.id, { messagingEnabled: true }),
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      inbox.listConversations({ ...actor, roles: ['manager'] }),
    ).rejects.toMatchObject({ statusCode: 403 })
    const audit = await db
      .select()
      .from(tables.platformAuditLogs)
      .where(eq(tables.platformAuditLogs.action, 'client.messaging_enabled'))
    expect(audit).toHaveLength(2)
  })

  it('deduplicates incoming updates and prevents another client from reading or sending to a conversation', async () => {
    await db.insert(tables.users).values({
      organizationId: actor.organizationId,
      name: 'Cleaner',
      email: 'cleaner@first.test',
      passwordHash: 'unused',
      status: 'active',
      roles: ['cleaner'],
    })
    const event = update('Question')
    await Promise.all([
      incoming.receiveTelegramUpdate(
        botConnection.id,
        botConnection.webhookSecret,
        event,
      ),
      incoming.receiveTelegramUpdate(
        botConnection.id,
        botConnection.webhookSecret,
        event,
      ),
    ])
    const first = (await inbox.listConversations(actor)).items[0]!
    expect(first.unread).toBe(1)
    const alerts = await db.select().from(tables.notifications)
      .where(eq(tables.notifications.type, 'guest_message'))
    expect(alerts).toMatchObject([{
      organizationId: actor.organizationId,
      userId: actor.id,
      title: 'Guest',
      body: 'Question',
      href: `/messages/${first.id}`,
      crmVisible: true,
    }])
    expect(
      (await inbox.listMessages(actor, first.id, undefined, 50)).items.map(
        (item) => item.text,
      ),
    ).toEqual(['Question'])
    expect((await inbox.listConversations(other)).items).toEqual([])
    await expect(
      inbox.listMessages(other, first.id, undefined, 50),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      inbox.enqueueMessage(other, first.id, {
        requestId: randomUUID(),
        text: 'forbidden',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      incoming.receiveTelegramUpdate(botConnection.id, 'wrong', update()),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('stops both directions on disable, cancels pending sends and preserves history after reenable', async () => {
    const id = await conversationId()
    await inbox.enqueueMessage(actor, id, {
      requestId: randomUUID(),
      text: 'Pending reply',
    })
    await platform.updateClient(
      { ...actor, isSuperuser: true },
      actor.organizationId,
      { messagingEnabled: false },
    )
    const duringDisabled = update('Must be skipped')
    await incoming.receiveTelegramUpdate(
      botConnection.id,
      botConnection.webhookSecret,
      duringDisabled,
    )
    await expect(
      inbox.listMessages(actor, id, undefined, 50),
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      inbox.enqueueMessage(actor, id, {
        requestId: randomUUID(),
        text: 'Forbidden',
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    fetchMock.mockClear()
    await outbox.processMessagingOutbox()
    expect(fetchMock).not.toHaveBeenCalled()
    await platform.updateClient(
      { ...actor, isSuperuser: true },
      actor.organizationId,
      { messagingEnabled: true },
    )
    await incoming.receiveTelegramUpdate(
      botConnection.id,
      botConnection.webhookSecret,
      duringDisabled,
    )
    const history = await inbox.listMessages(actor, id, undefined, 50)
    expect(history.items.map((item) => item.text)).toEqual([
      'Hello',
      'Pending reply',
    ])
    expect(history.items[1]?.status).toBe('canceled')
  })

  it('rejects a bot already assigned to another client and returns no credentials', async () => {
    const visible = await telegram.getConnection(actor)
    expect(visible).toEqual({
      connected: true,
      botName: 'Hotel',
      botUsername: 'test_bot',
      url: 'https://t.me/test_bot',
    })
    await expect(
      telegram.connectTelegram(other, '123456:abcdefghijklmnopqrstuvwx'),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(botConnection.encryptedToken).not.toContain(
      'abcdefghijklmnopqrstuvwx',
    )
  })

  it('queues a duplicate request once and records Telegram acceptance', async () => {
    const id = await conversationId()
    const request = { requestId: randomUUID(), text: 'Answer' }
    const [first, second] = await Promise.all([
      inbox.enqueueMessage(actor, id, request),
      inbox.enqueueMessage(actor, id, request),
    ])
    expect(first.id).toBe(second.id)
    fetchMock.mockClear()
    fetchMock.mockImplementation(async () =>
      Response.json({ ok: true, result: { message_id: 555 } }),
    )
    await Promise.all([
      outbox.processMessagingOutbox(),
      outbox.processMessagingOutbox(),
    ])
    const message = await db.query.messagingMessages.findFirst({
      where: eq(tables.messagingMessages.id, first.id),
    })
    expect(message?.status).toBe('sent')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a definite rate limit but never automatically repeats an unknown outcome', async () => {
    const id = await conversationId()
    const reply = await inbox.enqueueMessage(actor, id, {
      requestId: randomUUID(),
      text: 'Answer',
    })
    fetchMock.mockClear()
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ok: false,
        error_code: 429,
        parameters: { retry_after: 30 },
      }),
    )
    await outbox.processMessagingOutbox()
    expect(
      (
        await db.query.messagingMessages.findFirst({
          where: eq(tables.messagingMessages.id, reply.id),
        })
      )?.status,
    ).toBe('pending')
    await db.update(tables.messagingOutbox).set({ availableAt: new Date(0) })
    fetchMock.mockRejectedValueOnce(new Error('socket lost'))
    await outbox.processMessagingOutbox()
    await outbox.processMessagingOutbox()
    expect(
      (
        await db.query.messagingMessages.findFirst({
          where: eq(tables.messagingMessages.id, reply.id),
        })
      )?.status,
    ).toBe('unknown')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retains downloadable files within the organization and protects read acknowledgements from newer arrivals', async () => {
    const id = await conversationId()
    const reply = await inbox.enqueueMessage(
      actor,
      id,
      { requestId: randomUUID(), text: 'Instructions' },
      {
        data: Buffer.from('document contents'),
        name: 'guide.pdf',
        mimeType: 'application/pdf',
      },
    )
    const [attachment] = await db
      .select()
      .from(tables.messagingAttachments)
      .where(eq(tables.messagingAttachments.messageId, reply.id))
    expect(
      (
        await inbox.getMessageAttachment(actor, attachment!.id)
      ).content.toString(),
    ).toBe('document contents')
    await expect(
      inbox.getMessageAttachment(other, attachment!.id),
    ).rejects.toMatchObject({ statusCode: 404 })
    const firstHistory = await inbox.listMessages(actor, id, undefined, 50)
    await incoming.receiveTelegramUpdate(
      botConnection.id,
      botConnection.webhookSecret,
      update('Another question', { date: Math.floor(Date.now() / 1000) + 1 }),
    )
    await inbox.updateConversation(actor, id, {
      read: true,
      through: firstHistory.items[0]!.id,
    })
    expect((await inbox.listConversations(actor)).items[0]?.unread).toBe(2)
  })

  it('does not process messages for a blocked client and recovers expired delivery leases as unknown', async () => {
    const id = await conversationId()
    const reply = await inbox.enqueueMessage(actor, id, {
      requestId: randomUUID(),
      text: 'Answer',
    })
    await db
      .update(tables.messagingMessages)
      .set({ status: 'sending' })
      .where(eq(tables.messagingMessages.id, reply.id))
    await db
      .update(tables.messagingOutbox)
      .set({ leaseUntil: new Date(0), leaseToken: randomUUID() })
    await outbox.processMessagingOutbox()
    expect(
      (
        await db.query.messagingMessages.findFirst({
          where: eq(tables.messagingMessages.id, reply.id),
        })
      )?.status,
    ).toBe('unknown')
    await platform.updateClient(
      { ...actor, isSuperuser: true },
      actor.organizationId,
      { status: 'blocked' },
    )
    await incoming.receiveTelegramUpdate(
      botConnection.id,
      botConnection.webhookSecret,
      update('Blocked'),
    )
    expect(
      await db
        .select()
        .from(tables.messagingMessages)
        .where(
          and(
            eq(tables.messagingMessages.conversationId, id),
            eq(tables.messagingMessages.direction, 'incoming'),
          ),
        ),
    ).toHaveLength(1)
  })
  it('paginates history without gaps when messages share a timestamp', async () => {
    const id = await conversationId()
    const date = Math.floor(Date.now() / 1000)
    for (const text of ['Second', 'Third', 'Fourth']) {
      await incoming.receiveTelegramUpdate(
        botConnection.id,
        botConnection.webhookSecret,
        update(text, { date }),
      )
    }
    await db.execute(
      sql`UPDATE messaging_messages SET created_at = '2026-11-08T00:00:00.123456Z'::timestamptz WHERE conversation_id = ${id}`,
    )
    const first = await inbox.listMessages(actor, id, undefined, 2)
    const second = await inbox.listMessages(actor, id, first.next!, 2)
    const combined = [...second.items, ...first.items]
    expect(new Set(combined.map((message) => message.id)).size).toBe(4)
    expect(combined.map((message) => message.text).sort()).toEqual([
      'Fourth',
      'Hello',
      'Second',
      'Third',
    ])
    expect(first.conversation?.id).toBe(id)
  })

  it('downloads incoming media through the protected endpoint and sends a stored document', async () => {
    await incoming.receiveTelegramUpdate(
      botConnection.id,
      botConnection.webhookSecret,
      update('', {
        voice: { file_id: 'voice-1', file_size: 5, mime_type: 'audio/ogg' },
      }),
    )
    const id = (await inbox.listConversations(actor)).items[0]!.id
    const voice = (await inbox.listMessages(actor, id, undefined, 50)).items[0]!
      .attachments[0]!
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/getFile')
        ? Response.json({
            ok: true,
            result: { file_path: 'voice/one.ogg', file_size: 5 },
          })
        : new Response('voice'),
    )
    expect(
      (await inbox.getMessageAttachment(actor, voice.id)).content.toString(),
    ).toBe('voice')
    await inbox.enqueueMessage(
      actor,
      id,
      { requestId: randomUUID(), text: 'Guide' },
      {
        data: Buffer.from('pdf'),
        name: 'guide.pdf',
        mimeType: 'application/pdf',
      },
    )
    let uploaded: FormData | undefined
    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      uploaded = options.body as FormData
      return Response.json({ ok: true, result: { message_id: 1000 } })
    })
    await outbox.processMessagingOutbox()
    expect(uploaded?.get('caption')).toBe('Guide')
    expect(await (uploaded?.get('document') as File).text()).toBe('pdf')
    await telegram.disconnectTelegram(actor)
    const ignored = update('Disconnected')
    await incoming.receiveTelegramUpdate(
      botConnection.id,
      botConnection.webhookSecret,
      ignored,
    )
    await expect(
      inbox.enqueueMessage(actor, id, {
        requestId: randomUUID(),
        text: 'No connection',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(
      (await inbox.listMessages(actor, id, undefined, 50)).items,
    ).toHaveLength(2)
  })

  it('accepts signed LINE text and media once, isolates tenants, and disconnects only LINE', async () => {
    const line = await import('../server/modules/messaging/line-connection')
    const { receiveLineWebhook } = await import('../server/modules/messaging/line-incoming')
    const secret = 'b'.repeat(32)
    const destination = 'U' + 'c'.repeat(32)
    const userId = 'U' + 'd'.repeat(32)
    let deliveredText: string | undefined
    let failFileOnce = true
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/bot/info'))
        return Response.json({ userId: destination, displayName: 'Test LINE', basicId: '@test' })
      if (url.includes('/profile/')) return Response.json({ displayName: 'LINE Guest' })
      if (url.endsWith('/pdf/content') && failFileOnce) {
        failFileOnce = false
        return new Response(null, { status: 503 })
      }
      if (url.endsWith('/pdf/content')) return new Response('pdf', { headers: { 'content-type': 'application/pdf' } })
      if (url.endsWith('/image/content')) return new Response('photo', { headers: { 'content-type': 'image/jpeg' } })
      if (url.endsWith('/push')) {
        deliveredText = JSON.parse(String(init.body)).messages[0].text
        return new Response('{}', { headers: { 'x-line-request-id': 'line-accepted' } })
      }
      return Response.json({ ok: true, result: { message_id: 55 } })
    })

    const setup = await line.connectLine(actor, 'test-access-token', secret)
    expect(setup).toMatchObject({ pending: true, connected: false, botName: 'Test LINE' })
    expect(JSON.stringify(setup)).not.toContain(secret)
    await expect(line.connectLine(other, 'other-token', secret)).rejects.toMatchObject({ statusCode: 409 })
    const id = setup.webhookUrl!.split('/').at(-2)!
    const deliver = (events: unknown[], target = destination) => {
      const raw = Buffer.from(JSON.stringify({ destination: target, events }))
      const signature = createHmac('sha256', secret).update(raw).digest('base64')
      return receiveLineWebhook(id, signature, raw)
    }
    const event = (message: { id: string; type: string; [key: string]: unknown }) => ({
      type: 'message', mode: 'active', timestamp: Date.now(), webhookEventId: message.id,
      source: { type: 'user', userId }, message,
    })
    const text = event({ id: 'text', type: 'text', text: 'Booking question' })
    await deliver([text])
    expect((await inbox.listConversations(actor)).items).toHaveLength(0)
    await expect(receiveLineWebhook(id, 'wrong', Buffer.from('{}'))).rejects.toMatchObject({ statusCode: 403 })
    await expect(deliver([], userId)).rejects.toMatchObject({ statusCode: 403 })
    await deliver([])
    expect(await line.getLineConnection(actor)).toMatchObject({ pending: false, connected: true })
    const events = [
      text,
      event({ id: 'image', type: 'image', contentProvider: { type: 'line' } }),
      event({ id: 'pdf', type: 'file', fileName: 'booking.pdf', fileSize: 3 }),
      event({ id: 'huge', type: 'file', fileName: 'huge.pdf', fileSize: 21 * 1024 * 1024 }),
    ]
    await expect(deliver(events)).rejects.toMatchObject({ statusCode: 502 })
    await deliver(events)
    await deliver(events)
    const [chat] = (await inbox.listConversations(actor)).items
    expect(chat).toMatchObject({ channel: 'line', name: 'LINE Guest', unread: 4 })
    const alerts = await db.select().from(tables.notifications)
      .where(eq(tables.notifications.type, 'guest_message'))
    expect(alerts).toHaveLength(4)
    expect(alerts.every(alert => alert.userId === actor.id && alert.title === 'LINE Guest' &&
      alert.href === `/messages/${chat!.id}`)).toBe(true)
    expect(alerts.map(alert => alert.body)).toEqual(expect.arrayContaining([
      'Booking question', 'photo.jpg', 'booking.pdf', 'huge.pdf',
    ]))
    expect((await inbox.listConversations(other)).items).toHaveLength(0)
    await expect(inbox.listMessages(other, chat!.id, undefined, 50)).rejects.toMatchObject({ statusCode: 404 })

    const history = await inbox.listMessages(actor, chat!.id, undefined, 50)
    expect(history.items.map((item) => item.text)).toContain('Booking question')
    const files = history.items.flatMap((item) => item.attachments)
    for (const [name, content] of [['photo.jpg', 'photo'], ['booking.pdf', 'pdf']]) {
      const file = files.find((attachment) => attachment.name === name)!
      expect((await inbox.getMessageAttachment(actor, file.id)).content.toString()).toBe(content)
      await expect(inbox.getMessageAttachment(other, file.id)).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(files.find((file) => file.name === 'huge.pdf')?.available).toBe(false)
    await expect(inbox.enqueueMessage(actor, chat!.id, { requestId: randomUUID(), text: '' }, {
      name: 'reply.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf'),
    })).rejects.toMatchObject({ statusCode: 422 })
    const reply = await inbox.enqueueMessage(actor, chat!.id, { requestId: randomUUID(), text: 'LINE reply' })
    await outbox.processMessagingOutbox()
    expect(deliveredText).toBe('LINE reply')
    expect((await inbox.listMessages(actor, chat!.id, undefined, 50)).items.find((item) => item.id === reply.id)?.status).toBe('sent')

    await incoming.receiveTelegramUpdate(botConnection.id, botConnection.webhookSecret, update())
    const telegramId = (await inbox.listConversations(actor)).items.find((item) => item.channel === 'telegram')!.id
    const pendingTelegram = await inbox.enqueueMessage(actor, telegramId, { requestId: randomUUID(), text: 'Telegram reply' })
    const pendingLine = await inbox.enqueueMessage(actor, chat!.id, { requestId: randomUUID(), text: 'Stop LINE' })
    await line.disconnectLine(actor)
    await deliver([])
    expect(await line.getLineConnection(actor)).toMatchObject({ pending: false, connected: false })
    expect(await telegram.getConnection(actor)).toMatchObject({ connected: true })
    await outbox.processMessagingOutbox()
    expect((await inbox.listMessages(actor, chat!.id, undefined, 50)).items.find((item) => item.id === pendingLine.id)?.status).toBe('canceled')
    expect((await inbox.listMessages(actor, telegramId, undefined, 50)).items.find((item) => item.id === pendingTelegram.id)?.status).toBe('sent')
  })

  it('permits linking only a stay belonging to the same company', async () => {
    const id = await conversationId()
    const ownStay = await makeStay(actor)
    const foreignStay = await makeStay(other)
    await expect(
      inbox.updateConversation(actor, id, { stayId: foreignStay.id }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await inbox.updateConversation(actor, id, { stayId: ownStay.id })
    expect(
      (await inbox.listMessages(actor, id, undefined, 50)).conversation,
    ).toMatchObject({ stayId: ownStay.id, apartmentName: '101' })
    await inbox.updateConversation(actor, id, { stayId: null })
    expect((await inbox.listConversations(actor)).items[0]?.stayId).toBeNull()
  })

  it('lets only the superuser switch off a client guest directory while keeping bookings and chat history', async () => {
    const directory = await import('../server/modules/guest/guest.service')
    const booking = await import('../server/modules/stay/stay.service')
    const superuser = { ...actor, isSuperuser: true }
    const fields = { name: 'Guest', phone: '', email: '', whatsapp: '', notes: '' }
    const id = await conversationId()
    const guest = await directory.assignConversationGuest(actor, id, { action: 'create', guest: fields })

    await expect(platform.updateClient(actor, actor.organizationId, { guestsEnabled: false }))
      .rejects.toMatchObject({ statusCode: 403 })
    await platform.updateClient(superuser, actor.organizationId, { guestsEnabled: false })
    await expect(directory.getGuest(actor, guest.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(directory.saveGuest(actor, fields)).rejects.toMatchObject({ statusCode: 403 })
    await expect(directory.assignConversationGuest(actor, id, { action: 'link', guestId: guest.id }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await directory.listGuests(other, '', 1)).toEqual({ items: [], hasMore: false })
    expect(await inbox.listMessages(actor, id, undefined, 30)).toMatchObject({
      conversation: { guestId: null, guestDisplayName: null },
      items: [{ text: 'Hello' }],
    })

    const apartment = await makeApartment(actor)
    const stay = await booking.createStay({ ...actor, guestsEnabled: false }, {
      apartmentId: apartment.id, adultCount: 1, childCount: 0,
      checkInOn: '2030-01-01', checkOutOn: '2030-01-02', guestName: 'New guest',
    })
    expect(stay.guestName).toBe('New guest')
    expect(stay).not.toHaveProperty('guestId')

    await platform.updateClient(superuser, actor.organizationId, { guestsEnabled: true })
    expect((await directory.listGuests(actor, '', 1)).items.map(item => item.id)).toEqual([guest.id])
    expect((await inbox.listMessages(actor, id, undefined, 30)).conversation.guestId).toBe(guest.id)
    expect((await booking.getStayDetails(actor, stay.id)).guestId).toBeNull()
  })

  it('creates and reuses guests from bookings without guessing identity', async () => {
    const directory = await import('../server/modules/guest/guest.service')
    const booking = await import('../server/modules/stay/stay.service')
    const apartment = await makeApartment(actor)
    const base = { apartmentId: apartment.id, adultCount: 1, childCount: 0 }
    const dates = (day: number) => ({
      checkInOn: `2030-01-${String(day).padStart(2, '0')}`,
      checkOutOn: `2030-01-${String(day + 1).padStart(2, '0')}`,
    })
    const create = (day: number, contacts = {}, owner = actor) =>
      booking.createStay(owner, { ...base, ...dates(day), ...contacts })

    const [first, repeat] = await Promise.all([
      create(1, { guestName: 'Elena', guestPhone: '+359 888 123 456' }),
      create(3, { guestName: 'Elena', guestPhone: '00359 (888) 123-456', guestEmail: 'ELENA@example.test' }),
    ])
    expect(first.guestId).toBeTruthy()
    expect(repeat.guestId).toBe(first.guestId)
    const emailOnly = await create(5, { guestEmail: 'elena@EXAMPLE.test' }, { ...actor, roles: ['manager'] })
    expect(emailOnly).not.toHaveProperty('guestId')
    expect((await directory.getGuest(actor, first.guestId!)).stays.map(stay => stay.id))
      .toEqual([emailOnly.id, repeat.id, first.id])
    expect((await directory.listGuests(actor, '888123456', 1)).items).toHaveLength(1)
    expect((await directory.listGuests(actor, 'ELENA@', 1)).items).toHaveLength(1)
    expect((await create(7, { guestPhone: '+359888123456', guestEmail: 'elena@example.test' })).guestId).toBe(first.guestId)

    const nameOnly = await create(9, { guestName: 'Elena' })
    expect(nameOnly.guestId).toBeTruthy()
    expect(nameOnly.guestId).not.toBe(first.guestId)
    expect((await create(11)).guestId).toBeNull()
    const second = await create(13, { guestEmail: 'second@example.test' })
    await expect(create(15, { guestPhone: '+359888123456', guestEmail: 'second@example.test' }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await booking.listStays(actor)).toHaveLength(7)

    const ical = await db.insert(tables.stays).values({
      ...dates(17), organizationId: actor.organizationId, apartmentId: apartment.id, source: 'ical',
    }).returning({ id: tables.stays.id, guestId: tables.stays.guestId })
    expect(ical[0]?.guestId).toBeNull()
    await directory.linkGuestStay(actor, first.guestId!, ical[0]!.id, true)
    expect((await booking.getStayDetails(actor, ical[0]!.id)).guestId).toBe(first.guestId)
    await directory.linkGuestStay(actor, second.guestId!, ical[0]!.id, true)
    await expect(directory.linkGuestStay(actor, first.guestId!, ical[0]!.id, false))
      .rejects.toMatchObject({ statusCode: 404 })
    await directory.linkGuestStay(actor, second.guestId!, ical[0]!.id, false)
    expect((await booking.getStayDetails(actor, ical[0]!.id)).guestId).toBeNull()

    await booking.updateStay(actor, first.id, { ...base, ...dates(1), guestName: 'Changed', guestPhone: '111' })
    expect(await booking.getStayDetails(actor, first.id)).toMatchObject({ guestId: first.guestId, guestName: 'Changed' })
    await booking.deleteStay(actor, first.id)
    expect(await directory.getGuest(actor, first.guestId!)).toMatchObject({ name: 'Elena' })
    await expect(directory.getGuest(other, first.guestId!)).rejects.toMatchObject({ statusCode: 404 })
    await expect(directory.listGuests({ ...actor, roles: ['manager'] }, '', 1)).rejects.toMatchObject({ statusCode: 403 })
    await expect(directory.linkGuestStay(other, first.guestId!, repeat.id, true)).rejects.toMatchObject({ statusCode: 404 })
    const foreignApartment = await makeApartment(other)
    const foreignStay = await booking.createStay(other, {
      ...base, apartmentId: foreignApartment.id, ...dates(1), guestPhone: '+359888123456',
    })
    expect(foreignStay.guestId).not.toBe(first.guestId)
    await expect(directory.linkGuestStay(actor, first.guestId!, foreignStay.id, true)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('searches and pages manually managed guests without crossing company boundaries', async () => {
    const directory = await import('../server/modules/guest/guest.service')
    const fields = { name: 'Test Guest', phone: '', email: '', whatsapp: '', notes: '' }
    const first = await directory.saveGuest(actor, {
      ...fields, name: 'Test Guest 00', phone: '+359 888 234 567', notes: 'Private note',
    })
    await Promise.all(Array.from({ length: 30 }, (_, index) => directory.saveGuest(actor, {
      ...fields, name: `Test Guest ${String(index + 1).padStart(2, '0')}`,
    })))
    await directory.saveGuest(other, { ...fields, phone: '+359888234567' })
    const page1 = await directory.listGuests(actor, 'test guest', 1)
    const page2 = await directory.listGuests(actor, 'test guest', 2)
    expect(page1.items).toHaveLength(30)
    expect(page1.hasMore).toBe(true)
    expect(page2.items.map(guest => guest.name)).toEqual(['Test Guest 30'])
    expect(page2.hasMore).toBe(false)
    expect(page1.items[0]).toMatchObject({ id: first.id })
    expect(page1.items[0]).not.toHaveProperty('notes')
    await expect(directory.saveGuest(actor, { ...fields, phone: '00359 888234567' }))
      .rejects.toMatchObject({ statusCode: 409 })
    await directory.saveGuest(actor, { ...fields, name: 'Renamed', whatsapp: '+359888234567' }, first.id)
    expect(await directory.getGuest(actor, first.id)).toMatchObject({ name: 'Renamed', phone: '', whatsapp: '+359888234567', notes: '' })
    await expect(directory.saveGuest(other, fields, first.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('creates a guest and links the chat atomically, then allows linking an existing guest', async () => {
    const directory = await import('../server/modules/guest/guest.service')
    const id = await conversationId()
    const fields = { name: 'Guest from chat', phone: '', email: '', whatsapp: '', notes: '' }
    const foreign = await directory.saveGuest(other, fields)
    await expect(directory.assignConversationGuest(actor, id, { action: 'link', guestId: foreign.id }))
      .rejects.toMatchObject({ statusCode: 404 })
    await expect(directory.assignConversationGuest({ ...actor, roles: ['cleaner'] }, id, { action: 'create', guest: fields }))
      .rejects.toMatchObject({ statusCode: 403 })

    const requests = await Promise.allSettled([
      directory.assignConversationGuest(actor, id, { action: 'create', guest: fields }),
      directory.assignConversationGuest(actor, id, { action: 'create', guest: fields }),
    ])
    expect(requests.filter(request => request.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ statusCode: 409 }) }),
    ])
    const { items } = await directory.listGuests(actor, '', 1)
    expect(items).toHaveLength(1)
    const [created] = items
    const [chat] = (await directory.getGuest(actor, created!.id)).conversations
    expect(chat?.id).toBe(id)

    await directory.linkGuestContact(actor, created!.id, chat!.contactId, false)
    const existing = await directory.saveGuest(actor, { ...fields, name: 'Existing guest' })
    await directory.assignConversationGuest(actor, id, { action: 'link', guestId: existing.id })
    expect(await inbox.listMessages(actor, id, undefined, 50)).toMatchObject({
      conversation: { guestId: existing.id, guestDisplayName: existing.name, stayId: null },
      items: [expect.objectContaining({ direction: 'incoming' })],
    })
  })

  it('identifies a guest in both Telegram and LINE and preserves message history when unlinked', async () => {
    const directory = await import('../server/modules/guest/guest.service')
    const fields = { name: 'Maria', phone: '', email: '', whatsapp: '', notes: '' }
    const guest = await directory.saveGuest(actor, fields)
    const second = await directory.saveGuest(actor, { ...fields, name: 'Elena' })
    const foreign = await directory.saveGuest(other, fields)
    const telegramId = await conversationId()
    const { connectLine } = await import('../server/modules/messaging/line-connection')
    const { receiveLineWebhook } = await import('../server/modules/messaging/line-incoming')
    const secret = 'b'.repeat(32)
    const destination = 'U' + 'c'.repeat(32)
    const userId = 'U' + 'd'.repeat(32)
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/bot/info')
      ? Response.json({ userId: destination, displayName: 'LINE', basicId: '@test' })
      : Response.json({ displayName: 'LINE Guest' }))
    const setup = await connectLine(actor, 'test-access-token', secret)
    const lineId = setup.webhookUrl!.split('/').at(-2)!
    const deliver = (events: unknown[]) => {
      const raw = Buffer.from(JSON.stringify({ destination, events }))
      return receiveLineWebhook(lineId, createHmac('sha256', secret).update(raw).digest('base64'), raw)
    }
    await deliver([])
    await deliver([{
      type: 'message', mode: 'active', timestamp: Date.now(), webhookEventId: 'line-text',
      source: { type: 'user', userId }, message: { id: 'line-text', type: 'text', text: 'Hello' },
    }])
    const chats = (await directory.findGuestConversations(actor, '', 1)).items
    expect(chats.map(chat => chat.channel).sort()).toEqual(['line', 'telegram'])
    expect((await inbox.listConversations(actor)).items).toHaveLength(2)
    for (const chat of chats) {
      await directory.linkGuestContact(actor, guest.id, chat.contactId, true)
      await expect(directory.linkGuestContact(actor, second.id, chat.contactId, true)).rejects.toMatchObject({ statusCode: 409 })
      await expect(directory.linkGuestContact(other, foreign.id, chat.contactId, true)).rejects.toMatchObject({ statusCode: 404 })
      expect((await inbox.listMessages(actor, chat.id, undefined, 50)).conversation)
        .toMatchObject({ guestId: guest.id, guestDisplayName: 'Maria' })
    }
    expect((await directory.getGuest(actor, guest.id)).conversations).toHaveLength(2)
    expect((await inbox.listConversations(actor)).items).toMatchObject([
      { guestId: guest.id, channels: ['line', 'telegram'], unread: 2 },
    ])
    const lineChat = chats.find(chat => chat.channel === 'line')!
    const reply = await inbox.enqueueMessage(actor, telegramId, { requestId: randomUUID(), text: 'Telegram reply' })
    await db.update(tables.messagingMessages).set({ createdAt: new Date(Date.now() + 60_000) })
      .where(eq(tables.messagingMessages.id, reply.id))
    const latest = await inbox.listMessages(actor, telegramId, undefined, 1)
    expect(latest.replyTo).toBe(lineChat.id)
    const head = (await inbox.listConversations(actor)).items[0]!
    expect((await inbox.listConversations(actor, head.id)).items).toEqual([])
    expect(latest.items).toMatchObject([{ channel: 'telegram', direction: 'outgoing' }])
    expect((await inbox.listMessages(actor, lineChat.id, latest.next!, 1)).items)
      .toMatchObject([{ channel: 'line', direction: 'incoming' }])
    expect((await inbox.listMessages(actor, lineChat.id, undefined, 50)).items)
      .toMatchObject([{ channel: 'telegram' }, { channel: 'line' }, { channel: 'telegram' }])
    const telegramContact = chats.find(chat => chat.id === telegramId)!
    await directory.linkGuestContact(actor, guest.id, telegramContact.contactId, false)
    const telegramHistory = await inbox.listMessages(actor, telegramId, undefined, 50)
    expect(telegramHistory.conversation?.guestId).toBeNull()
    expect(telegramHistory.items).toHaveLength(2)
    expect((await inbox.listConversations(actor)).items).toHaveLength(2)
    await expect(inbox.enqueueMessage(
      actor, lineChat.id, { requestId: randomUUID(), text: 'Stale reply' }, undefined, telegramId,
    )).rejects.toMatchObject({ statusCode: 409, data: { code: 'MESSAGING_THREAD_CHANGED' } })
    await directory.linkGuestContact(actor, second.id, telegramContact.contactId, true)
    await platform.updateClient({ ...actor, isSuperuser: true }, actor.organizationId, { messagingEnabled: false })
    expect((await directory.getGuest(actor, guest.id)).conversations).toEqual([])
    await expect(directory.linkGuestContact(actor, second.id, telegramContact.contactId, false)).rejects.toMatchObject({ statusCode: 403 })
  })

})
