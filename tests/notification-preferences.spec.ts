import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { availableNotificationEvents, effectiveNotificationChannels, notificationPreferencesUpdateSchema } from '../shared/contracts/notification-preferences'
import { useNotificationPreferenceDraft, type PreferenceSnapshot } from '../src/pages/account/model/notification-preference-draft'
import { localizedNotificationTitle } from '../server/infrastructure/notification/localize'

describe('notification preference contracts', () => {
  it('defaults new events without enabling email and unions role access', () => {
    expect(effectiveNotificationChannels()).toEqual({ crm: true, push: true, email: false })
    const keys = availableNotificationEvents(['manager', 'cleaner']).map(event => event.key)
    expect(keys).toContain('expense_report_published')
    expect(keys).toContain('cleaning_assigned')
    expect(keys).not.toContain('booking_created')
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('rejects duplicate events, unknown channels and account identifiers', () => {
    const row = { event: 'manual', crm: true, push: true, email: false }
    for (const input of [{ changes: [row, row] }, { changes: [{ ...row, event: 'unknown' }] }, { changes: [{ ...row, sms: true }] }, { changes: [row], userId: 'foreign' }, { changes: [] }]) {
      expect(notificationPreferencesUpdateSchema.safeParse(input).success).toBe(false)
    }
  })
  it('preserves drafts on same-account refresh and rejects stale tenant responses', () => {
    const scope = effectScope()
    const identity = ref('a:organization-a')
    const snapshot = ref<PreferenceSnapshot | null>(null)
    const editor = scope.run(() => useNotificationPreferenceDraft(identity, snapshot))!
    const row = { event: 'manual' as const, crm: true, push: true, email: false }
    snapshot.value = { identity: identity.value, rows: [row] }
    editor.rows.value[0]!.email = true
    snapshot.value = { identity: identity.value, rows: [{ ...row, push: false }] }
    expect(editor.rows.value[0]!.push).toBe(false)
    expect(editor.rows.value[0]!.email).toBe(true)
    expect(editor.changed.value).toBe(true)
    identity.value = 'a:organization-b'
    expect(editor.rows.value).toEqual([])
    snapshot.value = { identity: 'a:organization-a', rows: [{ ...row, email: true }] }
    expect(editor.rows.value).toEqual([])
    snapshot.value = { identity: identity.value, rows: [row] }
    expect(editor.changed.value).toBe(false)
    scope.stop()
  })
  it('distinguishes new and changed bookings in translated notifications, retaining old records', () => {
    expect(localizedNotificationTitle('stay_changed', 'en', 'fallback', 'booking_created')).toBe('New booking')
    expect(localizedNotificationTitle('stay_changed', 'en', 'fallback', 'booking_updated')).toBe('Booking changed')
    expect(localizedNotificationTitle('stay_changed', 'en', 'fallback')).toBe('Booking updated')
    expect(localizedNotificationTitle('manual', 'he', 'Original', 'manual')).toBe('Original')
  })
})
