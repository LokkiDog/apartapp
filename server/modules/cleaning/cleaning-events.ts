import { and, eq, inArray } from 'drizzle-orm'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartmentManagers, users } from '../../infrastructure/database/schema'
import { notifyUsers } from '../../infrastructure/notification/publish'
import { publishNotification, type NotificationRealtimeMessage } from '../../infrastructure/notification/realtime'

export type CleaningChangeReason = Extract<NotificationRealtimeMessage, { type: 'cleaning.changed' }>['reason']
export type CleaningEventSnapshot = {
  id: string
  organizationId: string
  apartmentId: string
  apartmentName: string
  scheduledOn: string
  cleanerIds: string[]
}

type AppLocale = 'ru' | 'en' | 'he'
type LifecycleAction = 'scheduled' | 'assigned' | 'unassigned' | 'rescheduled' | 'accepted' | 'started' | 'completed' | 'deleted' | 'combined'

const localeCodes: Record<AppLocale, string> = { ru: 'ru-RU', en: 'en-US', he: 'he-IL' }
const lifecycleTitles: Record<LifecycleAction, Record<AppLocale, string>> = {
  scheduled: { ru: 'Уборка запланирована', en: 'Cleaning scheduled', he: 'ניקיון תוכנן' },
  assigned: { ru: 'Уборка назначена', en: 'Cleaning assigned', he: 'ניקיון הוקצה' },
  unassigned: { ru: 'Назначение снято', en: 'Cleaning assignment removed', he: 'הקצאת הניקיון הוסרה' },
  rescheduled: { ru: 'Уборка перенесена', en: 'Cleaning rescheduled', he: 'מועד הניקיון שונה' },
  accepted: { ru: 'Уборка принята', en: 'Cleaning accepted', he: 'הניקיון התקבל' },
  started: { ru: 'Уборка начата', en: 'Cleaning started', he: 'הניקיון התחיל' },
  completed: { ru: 'Уборка завершена', en: 'Cleaning completed', he: 'הניקיון הושלם' },
  deleted: { ru: 'Уборка удалена', en: 'Cleaning deleted', he: 'הניקיון נמחק' },
  combined: { ru: 'Уборка и исполнители изменены', en: 'Cleaning and assignees updated', he: 'פרטי הניקיון והצוות השתנו' }
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function formatScheduledOn(locale: AppLocale, value: string) {
  return new Intl.DateTimeFormat(localeCodes[locale], { dateStyle: 'medium', timeZone: 'Europe/Sofia' }).format(new Date(`${value}T12:00:00Z`))
}

export function cleaningLifecycleCopy(action: LifecycleAction, actorName: string, snapshot: CleaningEventSnapshot, previousScheduledOn?: string) {
  const title = lifecycleTitles[action]
  const body = Object.fromEntries((Object.keys(localeCodes) as AppLocale[]).map(locale => {
    const date = action === 'rescheduled' || action === 'combined'
      ? `${formatScheduledOn(locale, previousScheduledOn ?? snapshot.scheduledOn)} → ${formatScheduledOn(locale, snapshot.scheduledOn)}`
      : formatScheduledOn(locale, snapshot.scheduledOn)
    return [locale, `${actorName} · ${snapshot.apartmentName} · ${date}`]
  })) as Record<AppLocale, string>
  return { title, body }
}

export function cleaningNotificationHref(cleaningId: string, action: LifecycleAction) {
  return action === 'deleted' ? '/work' : `/cleanings/${cleaningId}`
}

async function audience(input: { actor: Actor; before?: CleaningEventSnapshot; after?: CleaningEventSnapshot }) {
  const apartmentIds = unique([input.before?.apartmentId, input.after?.apartmentId].filter((value): value is string => Boolean(value)))
  const candidates = await db.select({ id: users.id, roles: users.roles }).from(users).where(and(eq(users.organizationId, input.actor.organizationId), eq(users.status, 'active')))
  const activeIds = new Set(candidates.map(user => user.id))
  const administratorIds = candidates.filter(user => user.roles.includes('administrator')).map(user => user.id)
  const specialistIds = candidates.filter(user => user.roles.includes('specialist')).map(user => user.id)
  const managerRows = apartmentIds.length
    ? await db.select({ userId: apartmentManagers.userId }).from(apartmentManagers).where(and(eq(apartmentManagers.organizationId, input.actor.organizationId), inArray(apartmentManagers.apartmentId, apartmentIds)))
    : []
  const previousCleanerIds = (input.before?.cleanerIds ?? []).filter(id => activeIds.has(id))
  const currentCleanerIds = (input.after?.cleanerIds ?? []).filter(id => activeIds.has(id))
  return {
    administratorIds,
    previousCleanerIds,
    currentCleanerIds,
    realtimeUserIds: unique([
      input.actor.id,
      ...administratorIds,
      ...specialistIds,
      ...previousCleanerIds,
      ...currentCleanerIds,
      ...managerRows.map(row => row.userId).filter(id => activeIds.has(id))
    ])
  }
}

export function cleaningLifecycleActions(input: {
  actor: Actor
  before?: CleaningEventSnapshot
  after?: CleaningEventSnapshot
  reason: CleaningChangeReason
  administratorIds: string[]
  previousCleanerIds: string[]
  currentCleanerIds: string[]
}) {
  const actions = new Map<string, LifecycleAction>()
  const set = (userIds: string[], action: LifecycleAction) => userIds.forEach(userId => {
    if (userId !== input.actor.id) actions.set(userId, action)
  })
  const participants = unique([...input.administratorIds, ...input.previousCleanerIds, ...input.currentCleanerIds])

  if (input.reason === 'created' && input.after) {
    set(participants, input.after.cleanerIds.length ? 'assigned' : 'scheduled')
  } else if (input.reason === 'updated' && input.before && input.after) {
    const added = input.currentCleanerIds.filter(id => !input.previousCleanerIds.includes(id))
    const removed = input.previousCleanerIds.filter(id => !input.currentCleanerIds.includes(id))
    const retained = participants.filter(id => !added.includes(id) && !removed.includes(id))
    const assignmentChanged = added.length > 0 || removed.length > 0
    const dateChanged = input.before.scheduledOn !== input.after.scheduledOn
    if (assignmentChanged || dateChanged) {
      set(retained, dateChanged && assignmentChanged ? 'combined' : dateChanged ? 'rescheduled' : added.length ? 'assigned' : 'unassigned')
      set(added, 'assigned')
      set(removed, 'unassigned')
    }
  } else if (input.reason === 'accepted') set(participants, 'accepted')
  else if (input.reason === 'started') set(participants, 'started')
  else if (input.reason === 'completed') set(participants, 'completed')
  else if (input.reason === 'deleted') set(participants, 'deleted')

  return actions
}

export async function publishCleaningChange(input: {
  actor: Actor
  before?: CleaningEventSnapshot
  after?: CleaningEventSnapshot
  reason: CleaningChangeReason
}) {
  const context = input.after ?? input.before
  if (!context) return
  const recipients = await audience(input)
  const occurredAt = new Date().toISOString()
  for (const userId of recipients.realtimeUserIds) publishNotification(userId, { type: 'cleaning.changed', cleaningId: context.id, reason: input.reason, occurredAt })

  const actions = cleaningLifecycleActions({ ...input, ...recipients })
  const grouped = new Map<LifecycleAction, string[]>()
  for (const [userId, action] of actions) grouped.set(action, [...(grouped.get(action) ?? []), userId])
  for (const [action, userIds] of grouped) {
    const snapshot = action === 'unassigned' ? input.before ?? context : input.after ?? context
    const copy = cleaningLifecycleCopy(action, input.actor.name, snapshot, input.before?.scheduledOn)
    await notifyUsers({
      organizationId: input.actor.organizationId,
      userIds,
      type: 'cleaning_changed',
      title: copy.title,
      body: copy.body,
      href: cleaningNotificationHref(context.id, action)
    })
  }
}

export async function cleaningEventSnapshot(cleaningId: string) {
  const cleaning = await db.query.cleanings.findFirst({
    where: (cleanings, { eq }) => eq(cleanings.id, cleaningId),
    with: { apartment: { columns: { id: true, name: true } }, assignments: { columns: { cleanerId: true } } }
  })
  if (!cleaning) return null
  return {
    id: cleaning.id,
    organizationId: cleaning.organizationId,
    apartmentId: cleaning.apartmentId,
    apartmentName: cleaning.apartment.name,
    scheduledOn: cleaning.scheduledOn,
    cleanerIds: cleaning.assignments.map(assignment => assignment.cleanerId)
  } satisfies CleaningEventSnapshot
}

export async function publishCleaningChangeForId(actor: Actor, cleaningId: string, reason: CleaningChangeReason) {
  const snapshot = await cleaningEventSnapshot(cleaningId)
  if (snapshot?.organizationId !== actor.organizationId) return
  await publishCleaningChange({ actor, before: snapshot, after: snapshot, reason })
}
