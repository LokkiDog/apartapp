import type { SessionUser } from '#fsd/shared/auth'

// Renew only in response to use of the app. An idle tab must not keep a
// session alive indefinitely through a background interval.
export default defineNuxtPlugin(() => {
  const { user: sessionUser, session } = useUserSession()
  const user = sessionUser as Ref<SessionUser | null>
  const refreshInterval = 60_000
  let lastRefresh = 0
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    timer = undefined
    if (!user.value || pending || !navigator.onLine || document.visibilityState !== 'visible') return
    pending = true
    const userId = user.value.id
    lastRefresh = Date.now()
    try {
      // requireActor validates the account and renews the persistent cookie.
      await $fetch('/api/auth/me', { retry: false })
    } catch (cause) {
      const error = cause as { response?: { status?: number } }
      // Connection errors and server failures must not log the user out.
      if (error.response?.status === 401 && user.value?.id === userId) {
        session.value = null
        await navigateTo('/login')
      }
    } finally {
      pending = false
    }
  }

  function activity() {
    if (!user.value || !navigator.onLine || document.visibilityState !== 'visible') return
    const remaining = refreshInterval - (Date.now() - lastRefresh)
    if (remaining <= 0 && !pending) {
      if (timer) clearTimeout(timer)
      void refresh()
    } else if (!timer) {
      // One trailing request records the latest interaction during a burst.
      timer = setTimeout(() => { void refresh() }, Math.max(remaining, pending ? refreshInterval : 0))
    }
  }

  for (const event of ['pointerdown', 'keydown', 'scroll']) {
    window.addEventListener(event, activity, { passive: true })
  }
  window.addEventListener('focus', activity)
  window.addEventListener('online', activity)
  document.addEventListener('visibilitychange', activity)
  watch(() => user.value?.id, id => {
    if (timer) clearTimeout(timer)
    timer = undefined
    lastRefresh = 0
    if (id) activity()
  }, { immediate: true })
})
