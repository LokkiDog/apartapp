import { useNotificationState, type NotificationRealtimeMessage } from '#fsd/features/manage-notifications'
import { useCurrentUser, useCurrentUserScope } from '#fsd/shared/auth'

function websocketUrl(context?: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/notifications/ws${context ? `?clientContext=${encodeURIComponent(context)}` : ''}`
}

export default defineNuxtPlugin(() => {
  const user = useCurrentUser()
  const scope = useCurrentUserScope()
  const userSession = useUserSession()
  const notifications = useNotificationState()
  let socket: WebSocket | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined
  let attempts = 0
  let stopped = false
  let connectedOnce = false

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  function close() {
    clearRetry()
    clearTimeout(heartbeatTimer)
    const currentSocket = socket
    socket = null
    currentSocket?.close(1000, 'Session changed')
  }

  function isUnauthorized(cause: unknown) {
    const error = cause as { response?: { status?: number }, status?: number }
    return error.response?.status === 401 || error.status === 401
  }

  async function invalidateSession(reason: 'archived' | 'blocked' = 'archived') {
    if (stopped) return
    stopped = true
    close()
    userSession.session.value = null
    notifications.unreadCount.value = 0
    notifications.messagingUnreadCount.value = 0
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    if (reason === 'blocked') await navigateTo('/login?reason=blocked')
    else await navigateTo('/login?reason=archived')
  }

  async function validateSession() {
    if (stopped || !user.value || user.value.inSystem) return false
    const validatedScope = scope.value
    try {
      await $fetch('/api/auth/me')
      return !stopped && scope.value === validatedScope
    } catch (cause) {
      if (!stopped && scope.value === validatedScope) {
        if (isUnauthorized(cause)) await invalidateSession()
        else scheduleReconnect()
      }
      return false
    }
  }

  function scheduleReconnect() {
    if (stopped || !user.value || user.value.inSystem || retryTimer || !navigator.onLine) return
    const delay = [1_000, 2_000, 5_000, 10_000, 30_000][Math.min(attempts, 4)]!
    attempts += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void connectAfterValidation()
    }, delay)
  }

  function connect() {
    if (stopped || !user.value || user.value.inSystem || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    const connection = new WebSocket(websocketUrl(user.value?.isSuperuser ? `${user.value.organizationId}:${user.value.contextRevision}` : undefined))
    socket = connection
    function watchHeartbeat() {
      clearTimeout(heartbeatTimer)
      heartbeatTimer = setTimeout(() => {
        if (socket !== connection) return
        socket = null
        connection.close()
        scheduleReconnect()
      }, 60_000)
    }

    connection.addEventListener('open', () => {
      if (socket !== connection) return
      const reconnected = connectedOnce
      connectedOnce = true
      watchHeartbeat()
      if (reconnected) notifications.reconcileCleaningData()
    })
    connection.addEventListener('message', event => {
      if (socket !== connection) return
      watchHeartbeat()
      try {
        const message = JSON.parse(String(event.data)) as NotificationRealtimeMessage
        if (message.type === 'session.revoked') {
          void invalidateSession(message.reason)
          return
        }
        if (message.type === 'notifications.unread-count') attempts = 0
        notifications.applyRealtimeMessage(message)
      } catch {
        // The client never sends data; malformed server messages are ignored safely.
      }
    })
    connection.addEventListener('close', () => {
      if (socket !== connection) return
      clearTimeout(heartbeatTimer)
      socket = null
      scheduleReconnect()
    })
    connection.addEventListener('error', () => connection.close())
  }

  async function connectAfterValidation() {
    if (await validateSession()) connect()
  }

  watch(scope, () => {
    close()
    connectedOnce = false
    attempts = 0
    stopped = !user.value || Boolean(user.value.inSystem)
    notifications.unreadCount.value = 0
    notifications.messagingUnreadCount.value = 0
    if (!stopped) void connectAfterValidation()
  }, { immediate: true })

  const resume = () => {
    if (document.visibilityState !== 'visible') return
    if (!socket && !retryTimer) void connectAfterValidation()
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('online', resume)
  window.addEventListener('offline', close)

  if (import.meta.hot) import.meta.hot.dispose(() => {
    stopped = true
    close()
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('online', resume)
    window.removeEventListener('offline', close)
  })
})
