import { useNotificationState, type NotificationRealtimeMessage } from '#fsd/features/manage-notifications'
import { useCurrentUser } from '#fsd/shared/auth'

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/notifications/ws`
}

export default defineNuxtPlugin(() => {
  const user = useCurrentUser()
  const userSession = useUserSession()
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

  function isUnauthorized(cause: unknown) {
    const error = cause as { response?: { status?: number }, status?: number }
    return error.response?.status === 401 || error.status === 401
  }

  async function invalidateSession() {
    if (stopped) return
    stopped = true
    close()
    userSession.session.value = null
    notifications.unreadCount.value = 0
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    await navigateTo('/login?reason=archived')
  }

  async function validateSession() {
    if (stopped || !user.value) return false
    try {
      await $fetch('/api/auth/me')
      return true
    } catch (cause) {
      if (isUnauthorized(cause)) await invalidateSession()
      return false
    }
  }

  function scheduleReconnect() {
    if (stopped || !user.value || retryTimer || !navigator.onLine) return
    const delay = [1_000, 2_000, 5_000, 10_000, 30_000][Math.min(attempts, 4)]!
    attempts += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void connectAfterValidation()
    }, delay)
  }

  function connect() {
    if (stopped || !user.value || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    socket = new WebSocket(websocketUrl())
    socket.addEventListener('open', () => {
      attempts = 0
      void notifications.refreshUnreadCount()
      notifications.revision.value += 1
      notifications.reconcileCleaningData()
    })
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(String(event.data)) as NotificationRealtimeMessage
        if (message.type === 'session.revoked') {
          void invalidateSession()
          return
        }
        notifications.applyRealtimeMessage(message)
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

  async function connectAfterValidation() {
    if (await validateSession()) connect()
  }

  watch(user, currentUser => {
    if (currentUser) {
      stopped = false
      void notifications.refreshUnreadCount()
      void connectAfterValidation()
    } else {
      stopped = true
      close()
      notifications.unreadCount.value = 0
    }
  }, { immediate: true })

  window.addEventListener('online', () => { void connectAfterValidation() })
  window.addEventListener('offline', close)
})
