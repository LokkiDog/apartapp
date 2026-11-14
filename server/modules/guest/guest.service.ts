import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { conversationGuestSchema, guestInputSchema, normalizeGuestPhone, type GuestInput } from '@contracts/guests'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, guests, messagingConnections, messagingContacts, messagingConversations, organizations, stays } from '../../infrastructure/database/schema'
import { assertMessagingAccess, assertMessagingEnabled } from '../messaging/access'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const summary = {
  id: guests.id, name: guests.name, phone: guests.phone, email: guests.email, whatsapp: guests.whatsapp,
}
const staySummary = {
  id: stays.id, guestId: stays.guestId, apartmentName: apartments.name, guestName: stays.guestName,
  checkInOn: stays.checkInOn, checkOutOn: stays.checkOutOn, state: stays.state,
}
const pageSize = 30
async function assertGuestsAccess(actor: Actor) {
  requireRole(actor, 'administrator')
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, actor.organizationId), eq(organizations.status, 'active'), eq(organizations.guestsEnabled, true)),
    columns: { id: true },
  })
  if (!organization) throw createError({ statusCode: 403, statusMessage: 'Guest directory is unavailable' })
}

const guestScope = (actor: Actor, id: string) => and(eq(guests.organizationId, actor.organizationId), eq(guests.id, id))
const notFound = () => createError({ statusCode: 404, statusMessage: 'Guest not found' })
const contactConflict = () => createError({
  statusCode: 409, statusMessage: 'Guest contact conflict', data: { code: 'GUEST_CONTACT_CONFLICT' },
})

function contactKeys(phone: string, email: string) {
  return { phoneKey: normalizeGuestPhone(phone), emailKey: email.trim().toLowerCase() || null }
}

async function lockGuestContacts(tx: Transaction, organizationId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'guest-contacts:' + organizationId}, 0))`)
}

async function matchingGuests(tx: Transaction, organizationId: string, keys: ReturnType<typeof contactKeys>) {
  if (!keys.phoneKey && !keys.emailKey) return []
  return tx.select().from(guests).where(and(eq(guests.organizationId, organizationId), or(
    keys.phoneKey ? eq(guests.phoneKey, keys.phoneKey) : undefined,
    keys.emailKey ? eq(guests.emailKey, keys.emailKey) : undefined,
  )))
}

export async function resolveStayGuest(tx: Transaction, organizationId: string, name: string, phone: string, email: string) {
  if (!name && !phone && !email) return null
  const [organization] = await tx.select({ enabled: organizations.guestsEnabled })
    .from(organizations).where(and(eq(organizations.id, organizationId), eq(organizations.status, 'active'))).for('share')
  if (!organization?.enabled) return null
  await lockGuestContacts(tx, organizationId)
  const keys = contactKeys(phone, email)
  const matches = await matchingGuests(tx, organizationId, keys)
  if (matches.length > 1) throw contactConflict()
  const [match] = matches
  if (!match) {
    const [guest] = await tx.insert(guests).values({ organizationId, name, phone, email, ...keys }).returning({ id: guests.id })
    return guest!.id
  }
  const nextPhone = match.phone || phone
  const nextEmail = match.email || email
  if (nextPhone !== match.phone || nextEmail !== match.email) {
    await tx.update(guests).set({
      phone: nextPhone, email: nextEmail, ...contactKeys(nextPhone, nextEmail), updatedAt: new Date(),
    }).where(and(eq(guests.organizationId, organizationId), eq(guests.id, match.id)))
  }
  return match.id
}

function searchPattern(search: string) {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`
}

export async function listGuests(actor: Actor, search: string, page: number) {
  await assertGuestsAccess(actor)
  const pattern = searchPattern(search)
  const normalizedPhone = normalizeGuestPhone(search)
  const rows = await db.select(summary).from(guests)
    .where(and(eq(guests.organizationId, actor.organizationId), search ? or(
      ilike(guests.name, pattern), ilike(guests.email, pattern), ilike(guests.phone, pattern),
      normalizedPhone ? ilike(guests.phoneKey, searchPattern(normalizedPhone)) : undefined,
    ) : undefined))
    .orderBy(asc(guests.name), asc(guests.id)).limit(pageSize + 1).offset((page - 1) * pageSize)
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

async function writeGuest(tx: Transaction, actor: Actor, data: GuestInput, id?: string) {
  const keys = contactKeys(data.phone, data.email)
  await lockGuestContacts(tx, actor.organizationId)
  if ((await matchingGuests(tx, actor.organizationId, keys)).some(guest => guest.id !== id)) throw contactConflict()
  const [guest] = id
    ? await tx.update(guests).set({ ...data, ...keys, updatedAt: new Date() }).where(guestScope(actor, id)).returning(summary)
    : await tx.insert(guests).values({ ...data, ...keys, organizationId: actor.organizationId }).returning(summary)
  if (!guest) throw notFound()
  return guest
}

export async function saveGuest(actor: Actor, input: unknown, id?: string) {
  await assertGuestsAccess(actor)
  const data = guestInputSchema.parse(input)
  return db.transaction(tx => writeGuest(tx, actor, data, id))
}

function conversationQuery(actor: Actor, client: typeof db | Transaction = db) {
  return client.select({
    id: messagingConversations.id, contactId: messagingContacts.id, guestId: messagingContacts.guestId,
    channel: messagingConnections.channel, name: messagingContacts.name, username: messagingContacts.username,
  }).from(messagingContacts)
    .innerJoin(messagingConversations, and(eq(messagingConversations.contactId, messagingContacts.id), eq(messagingConversations.connectionId, messagingContacts.connectionId), eq(messagingConversations.organizationId, actor.organizationId)))
    .innerJoin(messagingConnections, and(eq(messagingConnections.id, messagingContacts.connectionId), eq(messagingConnections.organizationId, actor.organizationId)))
}

function staysQuery(actor: Actor) {
  return db.select(staySummary).from(stays)
    .innerJoin(apartments, and(eq(apartments.id, stays.apartmentId), eq(apartments.organizationId, actor.organizationId)))
}

export async function getGuest(actor: Actor, id: string) {
  await assertGuestsAccess(actor)
  const [guest] = await db.select({ ...summary, notes: guests.notes }).from(guests).where(guestScope(actor, id))
  if (!guest) throw notFound()
  const [organization] = await db.select({ enabled: organizations.messagingEnabled, status: organizations.status })
    .from(organizations).where(eq(organizations.id, actor.organizationId))
  const [linkedStays, conversations] = await Promise.all([
    staysQuery(actor).where(and(eq(stays.organizationId, actor.organizationId), eq(stays.guestId, id)))
      .orderBy(desc(stays.checkInOn), asc(stays.id)),
    organization?.enabled && organization.status === 'active'
      ? conversationQuery(actor).where(and(eq(messagingContacts.organizationId, actor.organizationId), eq(messagingContacts.guestId, id)))
        .orderBy(desc(messagingConversations.lastMessageAt))
      : [],
  ])
  return { ...guest, stays: linkedStays, conversations }
}

export async function findGuestStays(actor: Actor, search: string, page: number) {
  await assertGuestsAccess(actor)
  const pattern = searchPattern(search)
  const rows = await staysQuery(actor).where(and(eq(stays.organizationId, actor.organizationId), search ? or(
    ilike(stays.guestName, pattern), ilike(apartments.name, pattern), ilike(sql`cast(${stays.checkInOn} as text)`, pattern),
  ) : undefined)).orderBy(desc(stays.checkInOn), asc(stays.id)).limit(pageSize + 1).offset((page - 1) * pageSize)
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

export async function findGuestConversations(actor: Actor, search: string, page: number, channel?: 'telegram' | 'line') {
  await assertGuestsAccess(actor)
  await assertMessagingAccess(actor)
  const pattern = searchPattern(search)
  const rows = await conversationQuery(actor).where(and(eq(messagingContacts.organizationId, actor.organizationId), channel ? eq(messagingConnections.channel, channel) : undefined, search ? or(
    ilike(messagingContacts.name, pattern), ilike(messagingContacts.username, pattern),
  ) : undefined)).orderBy(desc(messagingConversations.lastMessageAt), asc(messagingConversations.id)).limit(pageSize + 1).offset((page - 1) * pageSize)
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

export async function linkGuestStay(actor: Actor, id: string, stayId: string, linked: boolean) {
  await assertGuestsAccess(actor)
  const [guest] = await db.select({ id: guests.id }).from(guests).where(guestScope(actor, id))
  if (!guest) throw notFound()
  const [stay] = await db.update(stays).set({ guestId: linked ? id : null, updatedAt: new Date() }).where(and(
    eq(stays.organizationId, actor.organizationId), eq(stays.id, stayId), linked ? undefined : eq(stays.guestId, id),
  )).returning({ id: stays.id })
  if (!stay) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  return { ok: true }
}

async function lockMessagingAccess(tx: Transaction, actor: Actor) {
  const [organization] = await tx.select({ status: organizations.status, messagingEnabled: organizations.messagingEnabled })
    .from(organizations).where(eq(organizations.id, actor.organizationId)).for('share')
  assertMessagingEnabled(organization)
}

async function updateGuestContact(tx: Transaction, actor: Actor, guestId: string, contactId: string, linked: boolean) {
  const scope = and(eq(messagingContacts.organizationId, actor.organizationId), eq(messagingContacts.id, contactId))
  const allowed = linked
    ? or(eq(messagingContacts.guestId, guestId), isNull(messagingContacts.guestId))
    : eq(messagingContacts.guestId, guestId)
  const [contact] = await tx.update(messagingContacts).set({ guestId: linked ? guestId : null, updatedAt: new Date() })
    .where(and(scope, allowed)).returning({ id: messagingContacts.id })
  if (contact) return

  const [existing] = await tx.select({ id: messagingContacts.id }).from(messagingContacts).where(scope)
  if (linked && existing) throw messagingConflict()
  throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
}

function messagingConflict() {
  return createError({
    statusCode: 409, statusMessage: 'Contact is linked to another guest', data: { code: 'GUEST_MESSAGING_CONFLICT' },
  })
}

export async function linkGuestContact(actor: Actor, id: string, contactId: string, linked: boolean) {
  await assertGuestsAccess(actor)
  return db.transaction(async tx => {
    await lockMessagingAccess(tx, actor)
    const [guest] = await tx.select({ id: guests.id }).from(guests).where(guestScope(actor, id))
    if (!guest) throw notFound()
    await updateGuestContact(tx, actor, id, contactId, linked)
    return { ok: true }
  })
}

export async function assignConversationGuest(actor: Actor, conversationId: string, input: unknown) {
  await assertGuestsAccess(actor)
  const data = conversationGuestSchema.parse(input)
  return db.transaction(async tx => {
    await lockMessagingAccess(tx, actor)
    const [contact] = await conversationQuery(actor, tx).where(and(
      eq(messagingContacts.organizationId, actor.organizationId),
      eq(messagingConversations.id, conversationId),
    ))
    if (!contact) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    if (contact.guestId && (data.action === 'create' || contact.guestId !== data.guestId)) throw messagingConflict()

    const [guest] = data.action === 'link'
      ? await tx.select(summary).from(guests).where(guestScope(actor, data.guestId))
      : [await writeGuest(tx, actor, data.guest)]
    if (!guest) throw notFound()
    await updateGuestContact(tx, actor, guest.id, contact.contactId, true)
    return guest
  })
}
