import { and, asc, desc, eq, gte, inArray, isNull, lt, ne } from 'drizzle-orm'
import type { Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartments, cleaningGuestPreparations, cleaningProblems, cleanings, stays, tasks } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { publishCleaningChangeForId } from './cleaning-events'
import { publishTaskChange } from '../task/task-events'
import { sofiaToday } from './checklist-template'

type StaySnapshot = { id: string; checkInOn: string; adultCount: number; childCount: number }
type LinenPlanEntry = { source: 'booking' | 'type_default'; stayId: string | null; checkInOn: string | null; adultCount: number | null; childCount: number | null; guestCount: number }

function effectiveDate(scheduledOn: string) {
  const today = sofiaToday()
  return scheduledOn > today ? scheduledOn : today
}

function stayPlan(stay: StaySnapshot): LinenPlanEntry {
  return { source: 'booking', stayId: stay.id, checkInOn: stay.checkInOn, adultCount: stay.adultCount, childCount: stay.childCount, guestCount: stay.adultCount + stay.childCount }
}

function defaultPlan(defaultLinenGuestCount: number): LinenPlanEntry {
  return { source: 'type_default', stayId: null, checkInOn: null, adultCount: null, childCount: null, guestCount: defaultLinenGuestCount }
}

function preparationPlan(preparation: { source: string; stayId: string | null; checkInOn: string | null; adultCount: number | null; childCount: number | null; guestCount: number }): LinenPlanEntry {
  return {
    source: preparation.source === 'booking' ? 'booking' : 'type_default',
    stayId: preparation.stayId,
    checkInOn: preparation.checkInOn,
    adultCount: preparation.adultCount,
    childCount: preparation.childCount,
    guestCount: preparation.guestCount
  }
}

async function nextStay(connection: any, organizationId: string, apartmentId: string, scheduledOn: string) {
  return connection.query.stays.findFirst({
    where: and(
      eq(stays.organizationId, organizationId),
      eq(stays.apartmentId, apartmentId),
      gte(stays.checkInOn, effectiveDate(scheduledOn))
    ),
    columns: { id: true, checkInOn: true, adultCount: true, childCount: true },
    orderBy: [asc(stays.checkInOn)]
  }) as Promise<StaySnapshot | undefined>
}

export async function captureCleaningGuestPreparation(tx: any, input: { cleaningId: string; organizationId: string; apartmentId: string; scheduledOn: string; defaultLinenGuestCount: number }) {
  const stay = await nextStay(tx, input.organizationId, input.apartmentId, input.scheduledOn)
  const plan = stay ? stayPlan(stay) : defaultPlan(input.defaultLinenGuestCount)
  await tx.insert(cleaningGuestPreparations).values({
    cleaningId: input.cleaningId,
    organizationId: input.organizationId,
    source: plan.source,
    stayId: plan.stayId,
    checkInOn: plan.checkInOn,
    adultCount: plan.adultCount,
    childCount: plan.childCount,
    guestCount: plan.guestCount
  })
  return plan
}

export function linenPlanForCleaningFromStays(cleaning: { apartmentId: string; scheduledOn: string; apartment: { type: { defaultLinenGuestCount: number } }; guestPreparation?: { source: string; stayId: string | null; checkInOn: string | null; adultCount: number | null; childCount: number | null; guestCount: number } | null }, stayRows: StaySnapshot[]) {
  const currentStay = stayRows.find(stay => stay.checkInOn >= effectiveDate(cleaning.scheduledOn))
  const current = currentStay ? stayPlan(currentStay) : defaultPlan(cleaning.apartment.type.defaultLinenGuestCount)
  const prepared = cleaning.guestPreparation ? preparationPlan(cleaning.guestPreparation) : null
  const monitoring = Boolean(prepared && (!prepared.checkInOn || prepared.checkInOn >= sofiaToday()))
  return { current, prepared, mismatch: Boolean(monitoring && prepared && prepared.guestCount !== current.guestCount), monitoring }
}

export async function linenPlanForCleaning(cleaning: { organizationId: string; apartmentId: string; scheduledOn: string; status: string; apartment: { type: { defaultLinenGuestCount: number } }; guestPreparation?: { source: string; stayId: string | null; checkInOn: string | null; adultCount: number | null; childCount: number | null; guestCount: number } | null }) {
  const currentStay = await nextStay(db, cleaning.organizationId, cleaning.apartmentId, cleaning.scheduledOn)
  return linenPlanForCleaningFromStays(cleaning, currentStay ? [currentStay] : [])
}

function preparationSourceLabel(plan: LinenPlanEntry) {
  return plan.source === 'booking' && plan.checkInOn ? `бронирование с заездом ${plan.checkInOn}` : 'значение «Стелить по умолчанию»'
}

function currentDetails(plan: LinenPlanEntry) {
  if (plan.source === 'type_default') return `сейчас будущего бронирования нет, используется значение по умолчанию: ${plan.guestCount}`
  const children = plan.childCount ? `, дети: ${plan.childCount}` : ''
  return `сейчас ближайший заезд ${plan.checkInOn}: ${plan.guestCount} гостей (взрослые: ${plan.adultCount}${children})`
}

function problemCopy(apartmentName: string, prepared: LinenPlanEntry, current: LinenPlanEntry) {
  return {
    description: `В убранном апартаменте «${apartmentName}» изменилось количество гостей`,
    details: `При уборке подготовлено на ${prepared.guestCount} гостей: ${preparationSourceLabel(prepared)}. Стало: ${currentDetails(current)}.`
  }
}

async function cancelActiveProblemTasks(actor: Actor, problemId: string) {
  const active = await db.query.tasks.findMany({
    where: and(eq(tasks.organizationId, actor.organizationId), eq(tasks.problemId, problemId), inArray(tasks.status, ['open', 'in_progress', 'resolved']))
  })
  if (!active.length) return
  await db.update(tasks).set({ status: 'canceled', updatedAt: new Date() }).where(inArray(tasks.id, active.map(task => task.id)))
  await Promise.all(active.map(task => publishTaskChange({ actor, taskId: task.id, assigneeIds: [task.assigneeId], reason: 'updated' })))
  await Promise.all(active.filter(task => task.assigneeId).map(task => notifyUsers({
    organizationId: actor.organizationId,
    userIds: [task.assigneeId!],
    type: 'work_canceled',
    title: 'Задача отменена',
    body: task.title,
    href: `/tasks/${task.id}`
  })))
}

async function refreshOpenProblemSummary(organizationId: string, cleaningId: string) {
  const open = await db.select({ description: cleaningProblems.description }).from(cleaningProblems).where(and(
    eq(cleaningProblems.organizationId, organizationId),
    eq(cleaningProblems.cleaningId, cleaningId),
    isNull(cleaningProblems.resolvedAt)
  ))
  await db.update(cleanings).set({
    hasProblem: open.length > 0,
    problemDescription: open.map(problem => problem.description.trim()).filter(Boolean).join('\n'),
    updatedAt: new Date()
  }).where(and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, organizationId)))
}

async function resolveGuestCountProblem(actor: Actor, problem: { id: string; cleaningId: string | null }) {
  await cancelActiveProblemTasks(actor, problem.id)
  await db.update(cleaningProblems).set({
    resolvedAt: new Date(),
    resolvedById: null,
    resolutionComment: 'Количество гостей снова соответствует подготовке.',
    updatedAt: new Date()
  }).where(eq(cleaningProblems.id, problem.id))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.auto_resolved', entityType: 'cleaning_problem', entityId: problem.id })
  if (problem.cleaningId) {
    await refreshOpenProblemSummary(actor.organizationId, problem.cleaningId)
    await publishCleaningChangeForId(actor, problem.cleaningId, 'progress')
  }
}

export async function reconcileCleaningGuestPreparation(actor: Actor, apartmentId: string) {
  const cleaning = await db.query.cleanings.findFirst({
    where: and(eq(cleanings.organizationId, actor.organizationId), eq(cleanings.apartmentId, apartmentId), eq(cleanings.status, 'completed')),
    with: { apartment: { with: { type: true } }, guestPreparation: true },
    orderBy: [desc(cleanings.completedAt)]
  })
  if (!cleaning?.guestPreparation) return
  const prepared = preparationPlan(cleaning.guestPreparation)
  if (prepared.checkInOn && prepared.checkInOn < sofiaToday()) return
  const currentStay = await nextStay(db, actor.organizationId, apartmentId, cleaning.scheduledOn)
  const current = currentStay ? stayPlan(currentStay) : defaultPlan(cleaning.apartment.type.defaultLinenGuestCount)
  const existing = await db.query.cleaningProblems.findFirst({
    where: and(eq(cleaningProblems.organizationId, actor.organizationId), eq(cleaningProblems.cleaningId, cleaning.id), eq(cleaningProblems.origin, 'guest_count_change'))
  })
  if (prepared.guestCount === current.guestCount) {
    if (existing && !existing.resolvedAt) await resolveGuestCountProblem(actor, existing)
    return
  }

  const copy = problemCopy(cleaning.apartment.name, prepared, current)
  let notify = false
  let problemId: string
  if (existing) {
    notify = Boolean(existing.resolvedAt)
    await db.update(cleaningProblems).set({
      ...copy,
      resolvedAt: notify ? null : existing.resolvedAt,
      resolvedById: notify ? null : existing.resolvedById,
      resolutionComment: notify ? '' : existing.resolutionComment,
      updatedAt: new Date()
    }).where(eq(cleaningProblems.id, existing.id))
    problemId = existing.id
  } else {
    const [created] = await db.insert(cleaningProblems).values({
      organizationId: actor.organizationId,
      apartmentId,
      cleaningId: cleaning.id,
      origin: 'guest_count_change',
      ...copy,
      createdById: null
    }).returning({ id: cleaningProblems.id })
    problemId = created!.id
    notify = true
  }
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: existing ? 'problem.auto_updated' : 'problem.auto_created', entityType: 'cleaning_problem', entityId: problemId, payload: { cleaningId: cleaning.id } })
  if (notify) await notifyUsers({
    organizationId: actor.organizationId,
    userIds: await administratorsForOrganization(actor.organizationId),
    type: 'problem',
    title: 'Изменилось количество гостей после уборки',
    body: copy.description,
    href: `/problems?problemId=${problemId}`
  })
  await refreshOpenProblemSummary(actor.organizationId, cleaning.id)
  await publishCleaningChangeForId(actor, cleaning.id, 'progress')
}

export async function supersedeCleaningGuestPreparations(actor: Actor, apartmentId: string, currentCleaningId: string) {
  const previous = await db.select({ id: cleanings.id }).from(cleanings)
    .innerJoin(cleaningGuestPreparations, eq(cleaningGuestPreparations.cleaningId, cleanings.id))
    .where(and(eq(cleanings.organizationId, actor.organizationId), eq(cleanings.apartmentId, apartmentId), eq(cleanings.status, 'completed'), ne(cleanings.id, currentCleaningId)))
  if (!previous.length) return
  const problems = await db.select({ id: cleaningProblems.id, cleaningId: cleaningProblems.cleaningId }).from(cleaningProblems)
    .where(and(eq(cleaningProblems.organizationId, actor.organizationId), eq(cleaningProblems.origin, 'guest_count_change'), isNull(cleaningProblems.resolvedAt), inArray(cleaningProblems.cleaningId, previous.map(item => item.id))))
  for (const problem of problems) await resolveGuestCountProblem(actor, problem)
}
