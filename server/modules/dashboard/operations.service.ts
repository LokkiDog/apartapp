import { and, asc, count, eq, gte, inArray, lt, or, isNull, lte } from 'drizzle-orm'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { cleaningGuestPreparations, cleaningProblems, cleanings, stays, tasks } from '../../infrastructure/database/schema'
import { buildOperations, operationsDate, shiftOperationsDate } from './operations-model'

export async function dashboardOperations(actor: Actor, now = new Date()) {
  requireRole(actor, 'administrator')
  const today = operationsDate(now)
  const end = shiftOperationsDate(today, 7)
  const apartment = { columns: { name: true }, with: { hotel: { columns: { name: true } } } } as const
  const upcoming = await db.query.stays.findMany({
    where: and(eq(stays.organizationId, actor.organizationId), eq(stays.state, 'active'), gte(stays.checkInOn, today), lt(stays.checkInOn, end)),
    columns: { id: true, apartmentId: true, checkInOn: true, checkOutOn: true, adultCount: true, childCount: true }, with: { apartment }, orderBy: [asc(stays.checkInOn), asc(stays.id)]
  })
  const apartmentIds = [...new Set(upcoming.map(s => s.apartmentId))]
  const snapshotRows = upcoming.length ? await db.select({ id: cleaningGuestPreparations.cleaningId }).from(cleaningGuestPreparations).where(and(eq(cleaningGuestPreparations.organizationId, actor.organizationId), inArray(cleaningGuestPreparations.stayId, upcoming.map(s => s.id)))) : []
  const [history, cleaningRows, taskRows, problemRows, problemCounts] = await Promise.all([
    apartmentIds.length ? db.query.stays.findMany({
      where: and(eq(stays.organizationId, actor.organizationId), eq(stays.state, 'active'), inArray(stays.apartmentId, apartmentIds), lt(stays.checkInOn, today)),
      columns: { id: true, apartmentId: true, checkInOn: true, checkOutOn: true, adultCount: true, childCount: true }, with: { apartment }
    }) : Promise.resolve([]),
    db.query.cleanings.findMany({
      where: and(eq(cleanings.organizationId, actor.organizationId), lt(cleanings.scheduledOn, end), or(
        inArray(cleanings.status, ['unassigned', 'assigned', 'in_progress']),
        and(gte(cleanings.scheduledOn, today), lt(cleanings.scheduledOn, end)),
        snapshotRows.length ? inArray(cleanings.id, snapshotRows.map(s => s.id)) : undefined
      )),
      columns: { id: true, apartmentId: true, stayId: true, scheduledOn: true, status: true, isUrgent: true, completedAt: true },
      with: { apartment, assignments: { columns: { cleanerId: true, acceptedAt: true }, with: { cleaner: { columns: { name: true } } } }, guestPreparation: { columns: { stayId: true, checkInOn: true, guestCount: true, capturedAt: true } } }
    }),
    db.query.tasks.findMany({
      where: and(eq(tasks.organizationId, actor.organizationId), or(eq(tasks.status, 'resolved'), and(inArray(tasks.status, ['open', 'in_progress']), lte(tasks.dueOn, today)))),
      columns: { id: true, apartmentId: true, title: true, dueOn: true, status: true, assigneeId: true }, with: { apartment, assignee: { columns: { name: true } } }
    }),
    apartmentIds.length ? db.query.cleaningProblems.findMany({ where: and(eq(cleaningProblems.organizationId, actor.organizationId), inArray(cleaningProblems.apartmentId, apartmentIds), isNull(cleaningProblems.resolvedAt)), columns: { id: true, apartmentId: true, description: true, origin: true, cleaningId: true } }) : Promise.resolve([]),
    db.select({ value: count() }).from(cleaningProblems).where(and(eq(cleaningProblems.organizationId, actor.organizationId), isNull(cleaningProblems.resolvedAt)))
  ])
  return {
    ...buildOperations({ stays: [...history, ...upcoming], cleanings: cleaningRows, tasks: taskRows, problems: problemRows }, now),
    problems: { openCount: Number(problemCounts[0]?.value ?? 0) }
  }
}
