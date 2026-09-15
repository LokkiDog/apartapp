import { useCleaningRealtimeState, useTaskRealtimeState, type CleaningChangeMessage, type TaskChangeMessage } from '#fsd/shared/realtime'

let notificationRevisionTimer: ReturnType<typeof setTimeout> | null = null
let cleaningRevisionTimer: ReturnType<typeof setTimeout> | null = null
let taskRevisionTimer: ReturnType<typeof setTimeout> | null = null
let pendingCleaningMessage: CleaningChangeMessage | null = null
let pendingTaskMessage: TaskChangeMessage | null = null

export type NotificationType = 'stay_changed' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published' | 'cleaning_changed'
export type { CleaningChangeMessage, TaskChangeMessage } from '#fsd/shared/realtime'

export type NotificationItem = {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string | null
  readAt: string | null
  createdAt: string
}

export type NotificationRealtimeMessage =
  | { type: 'notification.created'; notification: NotificationItem }
  | { type: 'notification.read'; id: string; readAt: string }
  | { type: 'notifications.read-all'; readAt: string }
  | { type: 'notifications.heartbeat' }
  | CleaningChangeMessage
  | TaskChangeMessage
  | { type: 'session.revoked'; reason: 'archived' }

export function useNotificationState() {
  const unreadCount = useState('notification-unread-count', () => 0)
  const revision = useState('notification-revision', () => 0)
  const cleaningRealtime = useCleaningRealtimeState()
  const taskRealtime = useTaskRealtimeState()
  const cleaningRevision = cleaningRealtime.revision
  const lastCleaningChange = cleaningRealtime.lastChange
  const taskRevision = taskRealtime.revision
  const lastTaskChange = taskRealtime.lastChange

  function scheduleNotificationRevision() {
    if (notificationRevisionTimer) return
    notificationRevisionTimer = setTimeout(() => {
      notificationRevisionTimer = null
      revision.value += 1
    }, 100)
  }

  function scheduleCleaningRevision(message: CleaningChangeMessage) {
    pendingCleaningMessage = message
    if (cleaningRevisionTimer) return
    cleaningRevisionTimer = setTimeout(() => {
      cleaningRevisionTimer = null
      if (pendingCleaningMessage) cleaningRealtime.apply(pendingCleaningMessage)
      pendingCleaningMessage = null
    }, 100)
  }

  function scheduleTaskRevision(message: TaskChangeMessage) {
    pendingTaskMessage = message
    if (taskRevisionTimer) return
    taskRevisionTimer = setTimeout(() => {
      taskRevisionTimer = null
      if (pendingTaskMessage) taskRealtime.apply(pendingTaskMessage)
      pendingTaskMessage = null
    }, 100)
  }

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
      scheduleCleaningRevision(message)
      return
    }
    if (message.type === 'task.changed') {
      scheduleTaskRevision(message)
      return
    }
    if (message.type === 'notification.created' && !message.notification.readAt) unreadCount.value += 1
    if (message.type === 'notification.read') unreadCount.value = Math.max(0, unreadCount.value - 1)
    if (message.type === 'notifications.read-all') unreadCount.value = 0
    scheduleNotificationRevision()
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

  return { unreadCount, revision, cleaningRevision, lastCleaningChange, taskRevision, lastTaskChange, refreshUnreadCount, applyRealtimeMessage, reconcileCleaningData, markRead, markAllRead }
}
