import { useNotificationState, type NotificationRealtimeMessage } from '#fsd/features/manage-notifications'
import { useCurrentUser } from '#fsd/shared/auth'

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/notifications/ws`
}

export default defineNuxtPlugin(() => {
  const user = useCurrentUser()
  const notifications = useNotificationState()
  let socket: WebSocket | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempts = 0
  let stopped = false

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  function close() {
    clearRetry()
    socket?.close(1000, 'Session changed')
    socket = null
  }

  function scheduleReconnect() {
    if (stopped || !user.value || retryTimer || !navigator.onLine) return
    const delay = [1_000, 2_000, 5_000, 10_000, 30_000][Math.min(attempts, 4)]!
    attempts += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, delay)
  }

  function connect() {
    if (stopped || !user.value || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    socket = new WebSocket(websocketUrl())
    socket.addEventListener('open', () => {
      attempts = 0
      void notifications.refreshUnreadCount()
      notifications.revision.value += 1
    })
    socket.addEventListener('message', event => {
      try {
        notifications.applyRealtimeMessage(JSON.parse(String(event.data)) as NotificationRealtimeMessage)
      } catch {
        // The client never sends data; malformed server messages are ignored safely.
      }
    })
    socket.addEventListener('close', () => {
      socket = null
      scheduleReconnect()
    })
    socket.addEventListener('error', () => socket?.close())
  }

  watch(user, currentUser => {
    if (currentUser) {
      stopped = false
      void notifications.refreshUnreadCount()
      connect()
    } else {
      stopped = true
      close()
      notifications.unreadCount.value = 0
    }
  }, { immediate: true })

  window.addEventListener('online', connect)
  window.addEventListener('offline', close)
})
