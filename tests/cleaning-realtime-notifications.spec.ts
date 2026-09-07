import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleaningLifecycleActions, cleaningLifecycleCopy, cleaningNotificationHref } from '../server/modules/cleaning/cleaning-events'

const snapshot = {
  id: 'cleaning-a',
  organizationId: 'organization-a',
  apartmentId: 'apartment-a',
  apartmentName: 'L102',
  scheduledOn: '2026-09-07',
  cleanerIds: ['cleaner-a']
}

describe('cleaning realtime notifications', () => {
  it('builds localized lifecycle copy with actor, apartment and date', () => {
    const expected = {
      scheduled: ['Уборка запланирована', 'Cleaning scheduled', 'ניקיון תוכנן'],
      assigned: ['Уборка назначена', 'Cleaning assigned', 'ניקיון הוקצה'],
      unassigned: ['Назначение снято', 'Cleaning assignment removed', 'הקצאת הניקיון הוסרה'],
      rescheduled: ['Уборка перенесена', 'Cleaning rescheduled', 'מועד הניקיון שונה'],
      accepted: ['Уборка принята', 'Cleaning accepted', 'הניקיון התקבל'],
      started: ['Уборка начата', 'Cleaning started', 'הניקיון התחיל'],
      completed: ['Уборка завершена', 'Cleaning completed', 'הניקיון הושלם'],
      deleted: ['Уборка удалена', 'Cleaning deleted', 'הניקיון נמחק']
    } as const

    for (const [action, titles] of Object.entries(expected)) {
      const copy = cleaningLifecycleCopy(action as keyof typeof expected, 'Анна', snapshot)
      expect([copy.title.ru, copy.title.en, copy.title.he]).toEqual(titles)
      for (const locale of ['ru', 'en', 'he'] as const) {
        expect(copy.body[locale]).toContain('Анна · L102 ·')
        expect(copy.body[locale]).toMatch(/2026|сент|Sep|בספט/)
      }
      expect(cleaningNotificationHref(snapshot.id, action as keyof typeof expected)).toBe(action === 'deleted' ? '/work' : `/cleanings/${snapshot.id}`)
    }
  })

  it('shows both dates for a rescheduled cleaning', () => {
    const copy = cleaningLifecycleCopy('rescheduled', 'Alex', snapshot, '2026-09-06')
    expect(copy.body.ru).toContain('Alex · L102 ·')
    expect(copy.body.ru).toContain('→')
    expect(copy.body.en).toContain('→')
    expect(copy.body.he).toContain('→')
  })

  it('personalizes a combined update once per recipient and excludes the actor', () => {
    const actor = { id: 'admin-a', organizationId: 'organization-a', email: 'admin@example.com', name: 'Admin', roles: ['administrator'] as const, locale: 'ru' as const }
    const before = { ...snapshot, scheduledOn: '2026-09-06', cleanerIds: ['cleaner-old', 'cleaner-retained'] }
    const after = { ...snapshot, cleanerIds: ['cleaner-new', 'cleaner-retained'] }
    const actions = cleaningLifecycleActions({
      actor: { ...actor, roles: [...actor.roles] },
      before,
      after,
      reason: 'updated',
      administratorIds: ['admin-a', 'admin-b'],
      previousCleanerIds: before.cleanerIds,
      currentCleanerIds: after.cleanerIds
    })

    expect(actions.get('admin-a')).toBeUndefined()
    expect(actions.get('admin-b')).toBe('combined')
    expect(actions.get('cleaner-retained')).toBe('combined')
    expect(actions.get('cleaner-new')).toBe('assigned')
    expect(actions.get('cleaner-old')).toBe('unassigned')
    expect(actions.has('unrelated-cleaner')).toBe(false)
    expect(actions.size).toBe(4)
  })

  it('does not create notification actions for progress or inventory refreshes', () => {
    const actor = { id: 'cleaner-a', organizationId: 'organization-a', email: 'cleaner@example.com', name: 'Cleaner', roles: ['cleaner'], locale: 'en' } as const
    for (const reason of ['progress', 'inventory', 'tariff', 'route'] as const) {
      expect(cleaningLifecycleActions({ actor: { ...actor, roles: [...actor.roles] }, before: snapshot, after: snapshot, reason, administratorIds: ['admin-a'], previousCleanerIds: snapshot.cleanerIds, currentCleanerIds: snapshot.cleanerIds }).size).toBe(0)
    }
  })

  it('publishes every cleaning mutation and keeps lifecycle notifications focused', () => {
    const service = readFileSync('server/modules/cleaning/cleaning.service.ts', 'utf8')
    const inventory = readFileSync('server/modules/inventory/inventory.service.ts', 'utf8')
    const attachments = readFileSync('server/api/attachments/index.post.ts', 'utf8')
    const events = readFileSync('server/modules/cleaning/cleaning-events.ts', 'utf8')

    for (const reason of ['created', 'updated', 'accepted', 'started', 'progress', 'tariff', 'route', 'completed', 'deleted', 'linen']) {
      expect(service).toContain(`'${reason}'`)
    }
    expect(inventory).toContain("publishCleaningChangeForId(actor, cleaningId, 'inventory')")
    expect(inventory).toContain("publishCleaningChangeForId(actor, report.cleaningId, 'inventory')")
    expect(inventory).toContain("publishCleaningChangeForId(actor, data.sourceId, 'inventory')")
    expect(attachments).toContain("publishCleaningChangeForId(actor, cleaningIdForRealtime, 'progress')")
    expect(service).not.toContain("body: 'Вам назначена уборка'")
    expect(service).toContain('if (!assignment.acceptedAt) {')
    expect(service).toContain('isNull(cleaningAssignments.acceptedAt)')
    expect(service).toContain("if (cleaning.status === 'in_progress') return cleaning")
    expect(service).toContain("eq(cleanings.status, 'assigned')")
    expect(events).toContain("if (userId !== input.actor.id) actions.set(userId, action)")
    expect(events).toContain("eq(users.organizationId, input.actor.organizationId)")
    expect(events).toContain("eq(apartmentManagers.organizationId, input.actor.organizationId)")
    expect(events).toContain("eq(users.status, 'active')")
    expect(events).toContain("candidates.filter(user => user.roles.includes('specialist'))")
    expect(events).toContain('...specialistIds')
    expect(events).toContain('...managerRows.map(row => row.userId)')
    expect(events).not.toContain("input.reason === 'progress') set(participants")
    expect(events).not.toContain("input.reason === 'inventory') set(participants")
    expect(events).not.toContain("input.reason === 'route') set(participants")
  })

  it('invalidates all cleaning data surfaces and reconciles after reconnect', () => {
    const state = readFileSync('src/features/manage-notifications/model/notifications.ts', 'utf8')
    const cleaningRealtime = readFileSync('src/shared/realtime/model/cleaning-realtime.ts', 'utf8')
    const plugin = readFileSync('app/plugins/notifications-realtime.client.ts', 'utf8')
    const work = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    const detail = readFileSync('src/features/work-detail/ui/WorkDetailPage.vue', 'utf8')
    const calendar = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const dashboard = readFileSync('src/pages/dashboard/DashboardPage.vue', 'utf8')

    expect(state).toContain("message.type === 'cleaning.changed'")
    expect(state).toContain('cleaningRealtime.apply(message)')
    expect(cleaningRealtime).toContain("| 'linen'")
    expect(cleaningRealtime).toContain('revision.value += 1')
    expect(plugin).toContain('notifications.reconcileCleaningData()')
    expect(work).toContain('watch(notificationState.cleaningRevision')
    expect(work).toContain('watch(notificationState.revision')
    expect(work).toContain('void refreshTasks()')
    expect(detail).toContain('watch(cleaningRealtime.revision')
    expect(detail).toContain("change?.reason === 'deleted'")
    expect(calendar).toContain('watch(notificationState.cleaningRevision')
    expect(dashboard).toContain('watch(notificationState.cleaningRevision')
  })

  it('adds the notification type with an additive numbered migration', () => {
    const schema = readFileSync('server/infrastructure/database/schema.ts', 'utf8')
    const migration = readFileSync('server/infrastructure/database/migrations/0030_cleaning_realtime_notifications.sql', 'utf8')
    const journal = readFileSync('server/infrastructure/database/migrations/meta/_journal.json', 'utf8')
    const page = readFileSync('src/pages/notifications/NotificationsPage.vue', 'utf8')

    expect(schema).toContain("'cleaning_changed'")
    expect(migration).toBe('ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS \'cleaning_changed\';\n')
    expect(journal).toContain('"tag": "0030_cleaning_realtime_notifications"')
    expect(page).toContain("cleaning_changed: { icon: 'i-lucide-broom'")
  })
})
