export type CleaningChangeReason = 'created' | 'updated' | 'accepted' | 'started' | 'progress' | 'inventory' | 'tariff' | 'route' | 'completed' | 'deleted'
export type CleaningChangeMessage = { type: 'cleaning.changed'; cleaningId: string; reason: CleaningChangeReason; occurredAt: string }

export function useCleaningRealtimeState() {
  const revision = useState('cleaning-revision', () => 0)
  const lastChange = useState<CleaningChangeMessage | null>('last-cleaning-change', () => null)

  function apply(message: CleaningChangeMessage) {
    lastChange.value = message
    revision.value += 1
  }

  function reconcile() {
    lastChange.value = null
    revision.value += 1
  }

  return { revision, lastChange, apply, reconcile }
}
