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
  let attempts = 0
  let stopped = false
  let connectedOnce = false
  let countRequest: AbortController | undefined

  async function reconcileNotifications(force = false) {
    if (stopped || !user.value || user.value.inSystem || !navigator.onLine || document.visibilityState !== 'visible') return
    if (countRequest && !force) return
    countRequest?.abort()
    const request = new AbortController()
    countRequest = request
    try {
      const { count } = await $fetch<{ count: number }>('/api/notifications/unread-count', {
        signal: request.signal, retry: false, cache: 'no-store',
      })
      if (request.signal.aborted) return
      if (!force && count !== notifications.unreadCount.value) notifications.revision.value += 1
      notifications.unreadCount.value = count
    } catch {
      // Retain the last known count during a temporary connection failure.
    } finally {
      if (countRequest === request) countRequest = undefined
    }
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  function close() {
    clearRetry()
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
    countRequest?.abort()
    close()
    userSession.session.value = null
    notifications.unreadCount.value = 0
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
    connection.addEventListener('open', () => {
      if (socket !== connection) return
      const reconnected = connectedOnce
      connectedOnce = true
      attempts = 0
      notifications.revision.value += 1
      if (reconnected) notifications.reconcileCleaningData()
    })
    connection.addEventListener('message', event => {
      if (socket !== connection) return
      try {
        const message = JSON.parse(String(event.data)) as NotificationRealtimeMessage
        if (message.type === 'session.revoked') {
          void invalidateSession(message.reason)
          return
        }
        notifications.applyRealtimeMessage(message)
      } catch {
        // The client never sends data; malformed server messages are ignored safely.
      }
    })
    connection.addEventListener('close', () => {
      if (socket !== connection) return
      socket = null
      scheduleReconnect()
    })
    connection.addEventListener('error', () => connection.close())
  }

  async function connectAfterValidation() {
    if (await validateSession()) connect()
  }

  watch(notifications.revision, () => { void reconcileNotifications(true) })

  watch(scope, () => {
    countRequest?.abort()
    countRequest = undefined
    close()
    connectedOnce = false
    attempts = 0
    stopped = !user.value || Boolean(user.value.inSystem)
    notifications.unreadCount.value = 0
    if (!stopped) {
      void reconcileNotifications()
      void connectAfterValidation()
    }
  }, { immediate: true })

  // Catch missed events even when a socket remains open (for example across server replicas).
  const pollTimer = setInterval(() => { void reconcileNotifications() }, 10_000)
  const resume = () => {
    if (document.visibilityState !== 'visible') return
    // The socket may have missed events while the tab was hidden.
    if (!stopped) notifications.revision.value += 1
    if (!socket && !retryTimer) void connectAfterValidation()
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('online', resume)
  window.addEventListener('offline', close)

  if (import.meta.hot) import.meta.hot.dispose(() => {
    stopped = true
    countRequest?.abort()
    close()
    clearInterval(pollTimer)
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('online', resume)
    window.removeEventListener('offline', close)
  })
})
