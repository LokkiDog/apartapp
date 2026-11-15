import { and, eq, exists, gte, gt, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { aiAgentAnalyticsFields, aiAgentDailyFields, AiAgentPermission } from '@contracts/ai-agents'
import { isAdministrator, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, cleaningAssignments, cleaningGuestPreparations, cleanings, hotels, stays, tasks } from '../../infrastructure/database/schema'
import { findArrivalPreparation, operationsDate, shiftOperationsDate } from '../dashboard/operations-model'
import { apartmentScope, cleaningScope } from './reads'

type Scope = { apartmentId?: string }
type Daily = z.output<z.ZodObject<typeof aiAgentDailyFields>>
type Analytics = z.output<z.ZodObject<typeof aiAgentAnalyticsFields>>
const property = { id: apartments.id, name: apartments.name }
const activeCleaningStatuses = ['unassigned', 'assigned', 'in_progress'] as const
const activeTaskStatuses = ['open', 'in_progress'] as const

function propertyFilter(actor: Actor, scope: Scope) {
  return and(eq(apartments.organizationId, actor.organizationId), scope.apartmentId ? eq(apartments.id, scope.apartmentId) : undefined)
}

function visibleStays(actor: Actor, scope: Scope, from: string, to: string) {
  return db.select({ id: stays.id, apartment: property, checkInOn: stays.checkInOn, checkOutOn: stays.checkOutOn })
    .from(stays).innerJoin(apartments, and(eq(stays.apartmentId, apartments.id), propertyFilter(actor, scope)))
    .where(and(eq(stays.organizationId, actor.organizationId), eq(stays.state, 'active'), apartmentScope(actor),
      lte(stays.checkInOn, to), gte(stays.checkOutOn, from)))
}

function visibleCleanings(actor: Actor, scope: Scope, from: string, to: string, overdue = false) {
  return db.select({
    id: cleanings.id, apartment: property, date: cleanings.scheduledOn, status: cleanings.status,
    assigned: exists(db.select({ id: cleaningAssignments.cleaningId }).from(cleaningAssignments)
      .where(eq(cleaningAssignments.cleaningId, cleanings.id)))
  }).from(cleanings).innerJoin(apartments, and(eq(cleanings.apartmentId, apartments.id), propertyFilter(actor, scope)))
    .where(and(eq(cleanings.organizationId, actor.organizationId), cleaningScope(actor), lte(cleanings.scheduledOn, to),
      or(gte(cleanings.scheduledOn, from), overdue ? inArray(cleanings.status, activeCleaningStatuses) : undefined)))
}

function visibleTasks(actor: Actor, scope: Scope, from: string, to: string, overdue = false) {
  return db.select({
    id: tasks.id, apartment: property, date: tasks.dueOn, status: tasks.status,
    title: sql<string>`left(${tasks.title}, 160)`, assigned: sql<boolean>`${tasks.assigneeId} is not null`
  }).from(tasks).innerJoin(apartments, and(eq(tasks.apartmentId, apartments.id), propertyFilter(actor, scope)))
    .where(and(eq(tasks.organizationId, actor.organizationId), eq(tasks.category, 'general'),
      isAdministrator(actor) ? undefined : eq(tasks.assigneeId, actor.id), lte(tasks.dueOn, to),
      or(gte(tasks.dueOn, from), overdue ? inArray(tasks.status, activeTaskStatuses) : undefined)))
}

type StayRow = Awaited<ReturnType<typeof visibleStays>>[number]

async function unconfirmedArrivals(actor: Actor, arrivals: StayRow[], date: string) {
  if (!arrivals.length) return new Set<string>()
  const apartmentIds = [...new Set(arrivals.map(stay => stay.apartment.id))]
  const [previousDepartures, candidates] = await Promise.all([
    db.select({ apartmentId: stays.apartmentId, date: sql<string>`max(${stays.checkOutOn})::text` })
      .from(stays).where(and(eq(stays.organizationId, actor.organizationId), eq(stays.state, 'active'),
        inArray(stays.apartmentId, apartmentIds), lt(stays.checkInOn, date))).groupBy(stays.apartmentId),
    db.select({ apartmentId: cleanings.apartmentId, scheduledOn: cleanings.scheduledOn, status: cleanings.status,
      completedAt: cleanings.completedAt, stayId: cleaningGuestPreparations.stayId,
      arrivalDate: cleaningGuestPreparations.checkInOn, capturedAt: cleaningGuestPreparations.capturedAt })
      .from(cleanings).leftJoin(cleaningGuestPreparations, and(
        eq(cleaningGuestPreparations.organizationId, actor.organizationId),
        eq(cleaningGuestPreparations.cleaningId, cleanings.id)))
      .where(and(eq(cleanings.organizationId, actor.organizationId), cleaningScope(actor),
        inArray(cleanings.apartmentId, apartmentIds), lte(cleanings.scheduledOn, date),
        or(inArray(cleanings.status, activeCleaningStatuses),
          and(eq(cleanings.status, 'completed'), inArray(cleaningGuestPreparations.stayId, arrivals.map(stay => stay.id))))))
  ])
  const departureByApartment = new Map(previousDepartures.map(row => [row.apartmentId, row.date]))
  const cleaningsByApartment = new Map<string, Parameters<typeof findArrivalPreparation>[0]>()
  for (const row of candidates) {
    let group = cleaningsByApartment.get(row.apartmentId)
    if (!group) cleaningsByApartment.set(row.apartmentId, group = [])
    group.push({ ...row, guestPreparation: row.capturedAt
      ? { stayId: row.stayId, checkInOn: row.arrivalDate, capturedAt: row.capturedAt } : null })
  }
  return new Set(arrivals.filter(stay => {
    const apartmentId = stay.apartment.id
    const preparation = findArrivalPreparation(cleaningsByApartment.get(apartmentId) ?? [],
      { ...stay, apartmentId }, departureByApartment.get(apartmentId) ?? '')
    return preparation?.status !== 'completed'
  }).map(stay => stay.id))
}

const reasons = {
  overlap: { priority: 0, suggestedAction: 'Review the overlapping bookings and reconcile their dates in CRM.' },
  preparation_unconfirmed: { priority: 1, suggestedAction: 'Open the booking and verify apartment preparation before check-in.' },
  same_day_turnover: { priority: 2, suggestedAction: 'Check that preparation fits between check-out and check-in.' },
  overdue: { priority: 3, suggestedAction: 'Open the work item and verify its status and next step.' },
  unassigned: { priority: 4, suggestedAction: 'Review the work item and assign an eligible employee.' }
} as const
type Reason = keyof typeof reasons
type Item = { kind: 'arrival' | 'departure' | 'booking' | 'cleaning' | 'task'; id: string; apartment: { id: string; name: string };
  date: string; href: string; title?: string; status?: string; checkInOn?: string; checkOutOn?: string;
  issues: { reason: Reason; suggestedAction: string; href: string }[]; priority: number }
const dailyCursor = z.tuple([z.string(), z.uuid().nullable(), z.number().int(), z.iso.date(), z.string()])

export async function dailyOperations(actor: Actor, permissions: AiAgentPermission[], query: Daily, origin: string) {
  const today = operationsDate()
  const date = query.date ?? today
  const cursor = query.cursor ? dailyCursor.parse(JSON.parse(query.cursor)) : null
  if (cursor && (cursor[0] !== date || cursor[1] !== (query.apartmentId ?? null))) throw new Error('Cursor does not match the requested day and apartment.')
  const [bookings, work, taskRows] = await Promise.all([
    permissions.includes('bookings') ? visibleStays(actor, query, date, date) : null,
    permissions.includes('cleanings') ? visibleCleanings(actor, query, date, date, date === today) : null,
    permissions.includes('tasks') ? visibleTasks(actor, query, date, date, date === today) : null
  ])
  const arrivals = bookings?.filter(stay => stay.checkInOn === date) ?? []
  const departures = bookings?.filter(stay => stay.checkOutOn === date) ?? []
  const unconfirmed = bookings && work ? await unconfirmedArrivals(actor, arrivals, date) : new Set<string>()
  const occupied = new Map<string, number>()
  const departuresByApartment = new Set(departures.map(stay => stay.apartment.id))
  for (const stay of bookings ?? []) {
    if (stay.checkOutOn > date) occupied.set(stay.apartment.id, (occupied.get(stay.apartment.id) ?? 0) + 1)
  }
  const items: Item[] = []
  function add(item: Omit<Item, 'issues' | 'priority'>, flags: Reason[], assignmentHref?: string) {
    items.push({ ...item, priority: Math.min(5, ...flags.map(flag => reasons[flag].priority)),
      issues: flags.map(reason => ({
        reason,
        suggestedAction: reason === 'unassigned' && !isAdministrator(actor)
          ? 'Open the work item and ask an administrator to verify assignment.' : reasons[reason].suggestedAction,
        href: reason === 'unassigned' && assignmentHref ? assignmentHref : item.href
      })) })
  }
  for (const row of bookings ?? []) {
    const overlap = row.checkOutOn > date && (occupied.get(row.apartment.id) ?? 0) > 1
    const base = { id: row.id, apartment: row.apartment, date, checkInOn: row.checkInOn, checkOutOn: row.checkOutOn,
      href: new URL('/calendar?stay=' + row.id, origin).href }
    if (row.checkInOn === date) {
      const flags: Reason[] = []
      if (overlap) flags.push('overlap')
      if (unconfirmed.has(row.id)) flags.push('preparation_unconfirmed')
      if (departuresByApartment.has(row.apartment.id)) flags.push('same_day_turnover')
      add({ ...base, kind: 'arrival' }, flags)
    } else if (overlap) add({ ...base, kind: 'booking' }, ['overlap'])
    if (row.checkOutOn === date) add({ ...base, kind: 'departure' }, [])
  }
  for (const row of work ?? []) {
    const flags: Reason[] = []
    if (row.date < date) flags.push('overdue')
    if (row.status !== 'completed' && row.status !== 'canceled' && !row.assigned) flags.push('unassigned')
    add({ kind: 'cleaning', id: row.id, apartment: row.apartment, date: row.date, status: row.status,
      href: new URL('/cleanings/' + row.id, origin).href }, flags,
    isAdministrator(actor) ? new URL('/work?cleaningId=' + row.id, origin).href : undefined)
  }
  for (const row of taskRows ?? []) {
    if (!row.date) continue
    const flags: Reason[] = []
    if (row.date < date) flags.push('overdue')
    if ((row.status === 'open' || row.status === 'in_progress') && !row.assigned) flags.push('unassigned')
    add({ kind: 'task', id: row.id, apartment: row.apartment, date: row.date, title: row.title, status: row.status,
      href: new URL('/tasks/' + row.id, origin).href }, flags)
  }
  const key = (item: Item) => item.kind + ':' + item.id
  const ordered = items.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date) || key(a).localeCompare(key(b)))
  const matching = cursor ? ordered.filter(item =>
    (item.priority - cursor[2] || item.date.localeCompare(cursor[3]) || key(item).localeCompare(cursor[4])) > 0) : ordered
  const page = matching.slice(0, query.limit)
  const last = page.at(-1)
  return {
    date, timeZone: 'Europe/Sofia',
    totals: {
      bookings: bookings === null ? null : { arrivals: arrivals.length, departures: departures.length },
      cleanings: work === null ? null : { scheduled: work.filter(row => row.date === date).length, overdue: work.filter(row => row.date < date).length },
      tasks: taskRows === null ? null : { due: taskRows.filter(row => row.date === date).length, overdue: taskRows.filter(row => row.date! < date).length }
    },
    items: page.map(({ priority: _priority, ...item }) => item),
    nextCursor: matching.length > page.length && last ? JSON.stringify([date, query.apartmentId ?? null, last.priority, last.date, key(last)]) : null
  }
}

type Counts = { arrivals: number; departures: number; bookedNights: number; eligibleNights: number;
  cleanings: Record<string, number>; tasks: Record<string, number> }
function makeCounts(): Counts {
  return { arrivals: 0, departures: 0, bookedNights: 0, eligibleNights: 0, cleanings: {}, tasks: {} }
}
function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [status, count] of Object.entries(source)) target[status] = (target[status] ?? 0) + count
}
function mergeCounts(target: Counts, source: Counts) {
  target.arrivals += source.arrivals
  target.departures += source.departures
  target.bookedNights += source.bookedNights
  target.eligibleNights += source.eligibleNights
  addCounts(target.cleanings, source.cleanings)
  addCounts(target.tasks, source.tasks)
}

export async function operationsAnalytics(actor: Actor, permissions: AiAgentPermission[], query: Analytics) {
  const { from, to } = query
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
  if (days < 1 || days > 366) throw new Error('Choose a period of 1 to 366 calendar days.')
  const canReadBookings = permissions.includes('bookings')
  const [bookings, work, taskRows, active] = await Promise.all([
    canReadBookings ? visibleStays(actor, query, from, to) : [],
    permissions.includes('cleanings') ? visibleCleanings(actor, query, from, to) : [],
    permissions.includes('tasks') ? visibleTasks(actor, query, from, to) : [],
    canReadBookings ? db.select({ id: apartments.id }).from(apartments).innerJoin(hotels,
      and(eq(hotels.id, apartments.hotelId), eq(hotels.organizationId, actor.organizationId), eq(hotels.status, 'active')))
      .where(and(propertyFilter(actor, query), apartmentScope(actor), eq(apartments.status, 'active'))) : []
  ])
  const activeIds = new Set(active.map(row => row.id))
  const calendar = new Map<string, Counts>()
  for (let day = from; day <= to; day = shiftOperationsDate(day, 1)) {
    calendar.set(day, { ...makeCounts(), eligibleNights: activeIds.size })
  }
  const occupied = new Map<string, Set<string>>()
  for (const stay of bookings) {
    const arrival = calendar.get(stay.checkInOn)
    const departure = calendar.get(stay.checkOutOn)
    if (arrival) arrival.arrivals++
    if (departure) departure.departures++
    if (!activeIds.has(stay.apartment.id)) continue
    for (let day = stay.checkInOn > from ? stay.checkInOn : from; day < stay.checkOutOn && day <= to; day = shiftOperationsDate(day, 1)) {
      let ids = occupied.get(day)
      if (!ids) occupied.set(day, ids = new Set())
      ids.add(stay.apartment.id)
    }
  }
  for (const [day, ids] of occupied) calendar.get(day)!.bookedNights = ids.size
  for (const row of work) addCounts(calendar.get(row.date)!.cleanings, { [row.status]: 1 })
  for (const row of taskRows) if (row.date) addCounts(calendar.get(row.date)!.tasks, { [row.status]: 1 })
  const grouping = days <= 31 ? 'day' : days <= 93 ? 'week' : 'month'
  const buckets = new Map<string, { from: string; to: string; counts: Counts }>()
  const totals = makeCounts()
  for (const [date, counts] of calendar) {
    const key = grouping === 'month' ? date.slice(0, 7) : grouping === 'week'
      ? shiftOperationsDate(date, -((new Date(date).getUTCDay() + 6) % 7)) : date
    let bucket = buckets.get(key)
    if (!bucket) buckets.set(key, bucket = { from: date, to: date, counts: makeCounts() })
    bucket.to = date
    mergeCounts(bucket.counts, counts)
    mergeCounts(totals, counts)
  }
  const present = (counts: Counts) => ({
    bookings: canReadBookings ? {
      arrivals: counts.arrivals, departures: counts.departures, bookedNights: counts.bookedNights,
      eligibleNights: counts.eligibleNights,
      occupancyPercent: counts.eligibleNights ? Math.round(10_000 * counts.bookedNights / counts.eligibleNights) / 100 : null
    } : null,
    cleanings: permissions.includes('cleanings') ? counts.cleanings : null,
    tasks: permissions.includes('tasks') ? counts.tasks : null
  })
  return { from, to, timeZone: 'Europe/Sofia', grouping, totals: present(totals),
    series: [...buckets.values()].map(bucket => ({ from: bucket.from, to: bucket.to, ...present(bucket.counts) })) }
}
