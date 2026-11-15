import { useCleaningRealtimeState, useTaskRealtimeState, type CleaningChangeMessage, type TaskChangeMessage } from '#fsd/shared/realtime'

let notificationRevisionTimer: ReturnType<typeof setTimeout> | null = null
let cleaningRevisionTimer: ReturnType<typeof setTimeout> | null = null
let taskRevisionTimer: ReturnType<typeof setTimeout> | null = null
let pendingCleaningMessage: CleaningChangeMessage | null = null
let pendingTaskMessage: TaskChangeMessage | null = null

export type NotificationType = 'stay_changed' | 'stay_conflict' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published' | 'cleaning_changed' | 'task_resolved' | 'task_returned' | 'manual' | 'guest_message'
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
  | { type: 'notifications.unread-count'; count: number }
  | { type: 'messaging.unread-count'; count: number | null }
  | CleaningChangeMessage
  | TaskChangeMessage
  | { type: 'session.revoked'; reason: 'archived' | 'blocked' }

export function useNotificationState() {
  const unreadCount = useState('notification-unread-count', () => 0)
  const messagingUnreadCount = useState('messaging-unread-count-realtime', () => 0)
  const messagingRevision = useState('messaging-revision', () => 0)
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
    if (message.type === 'notifications.unread-count') {
      unreadCount.value = message.count
      scheduleNotificationRevision()
    }
    if (message.type === 'messaging.unread-count') {
      messagingUnreadCount.value = message.count ?? 0
      messagingRevision.value += 1
    }
  }

  function reconcileCleaningData() {
    cleaningRealtime.reconcile()
  }

  return { unreadCount, revision, messagingUnreadCount, messagingRevision, cleaningRevision, lastCleaningChange, taskRevision, lastTaskChange, applyRealtimeMessage, reconcileCleaningData }
}
