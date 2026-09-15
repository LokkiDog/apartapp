import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm'
import type { DashboardResponse } from '@contracts/dashboard'
import { canAccessWorkSection, managedApartmentIds, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { cleaningAssignments, cleaningProblems, cleanings, stays, tasks } from '../../infrastructure/database/schema'

const activeCleaningStatuses = ['unassigned', 'assigned', 'in_progress'] as const
const activeTaskStatuses = ['open', 'in_progress', 'resolved'] as const

function monthRange(month: string) {
  const [year, value] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year!, value!, 1))
  return { from: `${month}-01`, to: next.toISOString().slice(0, 10) }
}

export async function dashboardSummary(actor: Actor, month: string): Promise<DashboardResponse> {
  const range = monthRange(month)
  const administrator = actor.roles.includes('administrator')
  const specialist = actor.roles.includes('specialist') && !administrator
  const workerView = (actor.roles.includes('cleaner') && !administrator) || specialist
  const canViewWork = canAccessWorkSection(actor)
  const managedIds = workerView ? null : await managedApartmentIds(actor)

  const stayWhere = and(
    eq(stays.organizationId, actor.organizationId),
    or(
      and(gte(stays.checkInOn, range.from), lt(stays.checkInOn, range.to)),
      and(gte(stays.checkOutOn, range.from), lt(stays.checkOutOn, range.to))
    ),
    managedIds ? inArray(stays.apartmentId, managedIds) : undefined
  )
  const skipStays = workerView || Boolean(managedIds && !managedIds.length)
  const stayCountPromise = skipStays
    ? Promise.resolve([{ value: 0 }])
    : db.select({ value: count() }).from(stays).where(stayWhere)
  const stayPromise = skipStays
    ? Promise.resolve([])
    : db.query.stays.findMany({
        where: stayWhere,
        columns: { id: true, checkInOn: true, checkOutOn: true, adultCount: true, childCount: true },
        with: { apartment: { columns: { name: true }, with: { hotel: { columns: { name: true } } } } },
        orderBy: [asc(stays.checkInOn), asc(stays.id)],
        limit: 5
      })

  let accessibleCleaningIds: string[] | null = null
  if (canViewWork && !administrator && !specialist) {
    accessibleCleaningIds = (await db.select({ id: cleaningAssignments.cleaningId })
      .from(cleaningAssignments)
      .where(eq(cleaningAssignments.cleanerId, actor.id))).map(item => item.id)
  }
  const cleaningPromise = !canViewWork || (accessibleCleaningIds && !accessibleCleaningIds.length)
    ? Promise.resolve([])
    : db.query.cleanings.findMany({
        where: and(
          eq(cleanings.organizationId, actor.organizationId),
          inArray(cleanings.status, activeCleaningStatuses),
          gte(cleanings.scheduledOn, range.from),
          lt(cleanings.scheduledOn, range.to),
          accessibleCleaningIds ? inArray(cleanings.id, accessibleCleaningIds) : undefined
        ),
        columns: { id: true, status: true, scheduledOn: true, tariffSnapshot: true },
        with: { apartment: { columns: { name: true }, with: { hotel: { columns: { name: true } } } } },
        orderBy: [asc(cleanings.scheduledOn), asc(cleanings.id)]
      })

  const taskCriteria = [
    eq(tasks.organizationId, actor.organizationId),
    inArray(tasks.status, activeTaskStatuses),
    administrator ? undefined : eq(tasks.assigneeId, actor.id)
  ]
  const taskCountPromise = canViewWork
    ? db.select({ value: count() }).from(tasks).where(and(...taskCriteria))
    : Promise.resolve([{ value: 0 }])
  const undatedTaskPromise = canViewWork
    ? db.query.tasks.findMany({
        where: and(...taskCriteria, isNull(tasks.dueOn)),
        columns: { id: true, status: true, dueOn: true, hasProblem: true, problemDescription: true },
        with: { apartment: { columns: { name: true }, with: { hotel: { columns: { name: true } } } } },
        orderBy: [desc(tasks.updatedAt), desc(tasks.id)],
        limit: 4
      })
    : Promise.resolve([])

  const problemCriteria = and(eq(cleaningProblems.organizationId, actor.organizationId), isNull(cleaningProblems.resolvedAt))
  const problemCountPromise = administrator
    ? db.select({ value: count() }).from(cleaningProblems).where(problemCriteria)
    : Promise.resolve([{ value: 0 }])
  const problemItemsPromise = administrator
    ? db.query.cleaningProblems.findMany({
        where: problemCriteria,
        columns: { id: true, description: true },
        with: { apartment: { columns: { name: true }, with: { hotel: { columns: { name: true } } } } },
        orderBy: [desc(cleaningProblems.createdAt), desc(cleaningProblems.id)],
        limit: 4
      })
    : Promise.resolve([])

  const [stayCountRows, stayRows, cleaningRows, taskCountRows, undatedTasks, problemCountRows, problemItems] = await Promise.all([
    stayCountPromise,
    stayPromise,
    cleaningPromise,
    taskCountPromise,
    undatedTaskPromise,
    problemCountPromise,
    problemItemsPromise
  ])
  const cleanerPoolEur = Math.round(cleaningRows.reduce((sum, item) => sum + Number(item.tariffSnapshot.cleanerPoolEur ?? 0), 0) * 100) / 100

  return {
    stays: { count: Number(stayCountRows[0]?.value ?? 0), items: stayRows },
    cleanings: { count: cleaningRows.length, items: cleaningRows.slice(0, 5), cleanerPoolEur },
    tasks: { activeCount: Number(taskCountRows[0]?.value ?? 0), undatedItems: undatedTasks },
    problems: { openCount: Number(problemCountRows[0]?.value ?? 0), items: problemItems }
  }
}
