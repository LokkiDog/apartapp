import { useCleaningRealtimeState, type CleaningChangeMessage } from '#fsd/shared/realtime'

export type NotificationType = 'stay_changed' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published' | 'cleaning_changed'
export type { CleaningChangeMessage } from '#fsd/shared/realtime'

export type NotificationItem = {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string
  readAt: string | null
  createdAt: string
}

export type NotificationRealtimeMessage =
  | { type: 'notification.created'; notification: NotificationItem }
  | { type: 'notification.read'; id: string; readAt: string }
  | { type: 'notifications.read-all'; readAt: string }
  | { type: 'notifications.heartbeat' }
  | CleaningChangeMessage
  | { type: 'session.revoked'; reason: 'archived' }

export function useNotificationState() {
  const unreadCount = useState('notification-unread-count', () => 0)
  const revision = useState('notification-revision', () => 0)
  const cleaningRealtime = useCleaningRealtimeState()
  const cleaningRevision = cleaningRealtime.revision
  const lastCleaningChange = cleaningRealtime.lastChange

  async function refreshUnreadCount() {
    try {
      const response = await $fetch<{ count: number }>('/api/notifications/unread-count')
      unreadCount.value = response.count
    } catch {
      // Realtime reconnects and the notifications page both reconcile this indicator.
    }
  }

  function applyRealtimeMessage(message: NotificationRealtimeMessage) {
    if (message.type === 'notifications.heartbeat' || message.type === 'session.revoked') return
    if (message.type === 'cleaning.changed') {
      cleaningRealtime.apply(message)
      return
    }
    revision.value += 1
    void refreshUnreadCount()
  }

  function reconcileCleaningData() {
    cleaningRealtime.reconcile()
  }

  function markRead() {
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }

  function markAllRead() {
    unreadCount.value = 0
  }

  return { unreadCount, revision, cleaningRevision, lastCleaningChange, refreshUnreadCount, applyRealtimeMessage, reconcileCleaningData, markRead, markAllRead }
}
