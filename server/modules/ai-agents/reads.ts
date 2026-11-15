import { and, asc, eq, exists, gt, gte, lt, lte, notExists, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { aiAgentBookingsFields, aiAgentPeriodFields } from '@contracts/ai-agents'
import { isAdministrator, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartmentManagers, apartments, cleaningAssignments, cleanings, stays } from '../../infrastructure/database/schema'

type Period = z.output<z.ZodObject<typeof aiAgentPeriodFields>>
type BookingQuery = z.output<z.ZodObject<typeof aiAgentBookingsFields>>
const DAY_MS = 86_400_000
const cursorSchema = z.tuple([z.iso.date(), z.uuid()])
const apartment = { id: apartments.id, name: apartments.name }

export function validatePeriod({ from, to }: Period, nights = false) {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS
  if (nights ? days < 1 || days > 90 : days < 0 || days >= 90) {
    throw new Error(nights ? 'Choose a period of 1 to 90 nights.' : 'Choose a period of 1 to 90 calendar days.')
  }
}

function readDateCursor(cursor: string | undefined) {
  return cursor ? cursorSchema.parse(JSON.parse(cursor)) : undefined
}

export function apartmentScope(actor: Actor) {
  if (isAdministrator(actor)) return undefined
  return exists(db.select({ id: apartmentManagers.apartmentId }).from(apartmentManagers).where(and(
    eq(apartmentManagers.organizationId, actor.organizationId),
    eq(apartmentManagers.userId, actor.id),
    eq(apartmentManagers.apartmentId, apartments.id)
  )))
}

export function cleaningScope(actor: Actor) {
  if (isAdministrator(actor) || actor.roles.includes('specialist')) return undefined
  return exists(db.select({ id: cleaningAssignments.cleaningId }).from(cleaningAssignments).where(and(
    eq(cleaningAssignments.cleanerId, actor.id), eq(cleaningAssignments.cleaningId, cleanings.id)
  )))
}

function page<T>(rows: T[], limit: number, cursor: (row: T) => string) {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > limit && last ? cursor(last) : null }
}

function bookingDates(query: BookingQuery): SQL | undefined {
  if (query.mode === 'arrivals') return and(gte(stays.checkInOn, query.from), lte(stays.checkInOn, query.to))
  if (query.mode === 'departures') return and(gte(stays.checkOutOn, query.from), lte(stays.checkOutOn, query.to))
  return and(gt(stays.checkOutOn, query.from), lte(stays.checkInOn, query.to))
}

export async function listAgentBookings(actor: Actor, query: BookingQuery) {
  validatePeriod(query)
  const cursor = readDateCursor(query.cursor)
  const sortDate = query.mode === 'departures' ? stays.checkOutOn : stays.checkInOn
  const rows = await db.select({
    id: stays.id, apartment, checkInOn: stays.checkInOn, checkOutOn: stays.checkOutOn, state: stays.state
  }).from(stays).innerJoin(apartments, and(eq(apartments.id, stays.apartmentId), eq(apartments.organizationId, actor.organizationId)))
    .where(and(eq(stays.organizationId, actor.organizationId), eq(stays.state, 'active'), bookingDates(query),
      apartmentScope(actor), query.apartmentId ? eq(apartments.id, query.apartmentId) : undefined,
      cursor ? or(gt(sortDate, cursor[0]), and(eq(sortDate, cursor[0]), gt(stays.id, cursor[1]))) : undefined
    )).orderBy(asc(sortDate), asc(stays.id)).limit(query.limit + 1)
  return page(rows, query.limit, row => JSON.stringify([query.mode === 'departures' ? row.checkOutOn : row.checkInOn, row.id]))
}

export async function getAgentAvailability(actor: Actor, query: Period) {
  validatePeriod(query, true)
  const cursor = query.cursor ? z.uuid().parse(query.cursor) : undefined
  const booked = db.select({ id: stays.id }).from(stays).where(and(
    eq(stays.organizationId, actor.organizationId), eq(stays.apartmentId, apartments.id), eq(stays.state, 'active'),
    lt(stays.checkInOn, query.to), gt(stays.checkOutOn, query.from)
  ))
  const rows = await db.select(apartment).from(apartments).where(and(
    eq(apartments.organizationId, actor.organizationId), eq(apartments.status, 'active'), apartmentScope(actor),
    query.apartmentId ? eq(apartments.id, query.apartmentId) : undefined,
    cursor ? gt(apartments.id, cursor) : undefined, notExists(booked)
  )).orderBy(asc(apartments.id)).limit(query.limit + 1)
  return page(rows, query.limit, row => row.id)
}

export async function listAgentCleanings(actor: Actor, query: Period, canReadBookings: boolean) {
  validatePeriod(query)
  const cursor = readDateCursor(query.cursor)
  const rows = await db.select({
    id: cleanings.id, apartment, scheduledOn: cleanings.scheduledOn, status: cleanings.status, bookingId: stays.id
  }).from(cleanings)
    .innerJoin(apartments, and(eq(apartments.id, cleanings.apartmentId), eq(apartments.organizationId, actor.organizationId)))
    .leftJoin(stays, canReadBookings ? and(eq(stays.id, cleanings.stayId), eq(stays.apartmentId, apartments.id),
      eq(stays.organizationId, actor.organizationId), eq(stays.state, 'active'), apartmentScope(actor)
    ) : sql`false`)
    .where(and(eq(cleanings.organizationId, actor.organizationId), gte(cleanings.scheduledOn, query.from), lte(cleanings.scheduledOn, query.to),
      cleaningScope(actor), query.apartmentId ? eq(apartments.id, query.apartmentId) : undefined,
      cursor ? or(gt(cleanings.scheduledOn, cursor[0]), and(eq(cleanings.scheduledOn, cursor[0]), gt(cleanings.id, cursor[1]))) : undefined
    )).orderBy(asc(cleanings.scheduledOn), asc(cleanings.id)).limit(query.limit + 1)
  return page(rows, query.limit, row => JSON.stringify([row.scheduledOn, row.id]))
}
