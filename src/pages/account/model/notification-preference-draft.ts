import { computed, ref, watch, type Ref } from 'vue'
import { notificationChannels, type NotificationPreference } from '@contracts/notification-preferences'

export type PreferenceSnapshot = { identity: string; rows: NotificationPreference[] }
export function useNotificationPreferenceDraft(identity: Ref<string>, snapshot: Ref<PreferenceSnapshot | null>) {
  const rows = ref<NotificationPreference[]>([])
  const baseline = ref<NotificationPreference[]>([])
  const changes = computed(() => rows.value.filter(row => JSON.stringify(row) !== JSON.stringify(baseline.value.find(saved => saved.event === row.event))))
  const changed = computed(() => changes.value.length > 0)
  function accept(next: NotificationPreference[]) {
    baseline.value = next.map(row => ({ ...row }))
    rows.value = next.map(row => ({ ...row }))
  }
  watch(identity, () => accept([]), { flush: 'sync' })
  watch(snapshot, next => {
    if (!next || next.identity !== identity.value) return
    if (!changed.value) accept(next.rows)
    else {
      const drafts = new Map(rows.value.map(row => [row.event, row]))
      const saved = new Map(baseline.value.map(row => [row.event, row]))
      rows.value = next.rows.map(row => {
        const draft = drafts.get(row.event)
        const previous = saved.get(row.event)
        const merged = { ...row }
        if (draft && previous) for (const channel of notificationChannels) {
          if (draft[channel] !== previous[channel]) merged[channel] = draft[channel]
        }
        return merged
      })
      baseline.value = next.rows.map(row => ({ ...row }))
    }
  }, { immediate: true, flush: 'sync' })
  return { rows, changes, changed, accept }
}
