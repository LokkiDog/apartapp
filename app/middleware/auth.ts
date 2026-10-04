export default defineNuxtRouteMiddleware(async to => {
  if (to.path === '/login' || to.path === '/register' || to.path === '/set-password') return
  const { loggedIn, fetch } = useUserSession()
  if (import.meta.client && !navigator.onLine) return
  if (!loggedIn.value) await fetch()
  if (!loggedIn.value) return navigateTo('/login')
  if (import.meta.client) {
    try {
      const current = await $fetch('/api/auth/me', { retry: false })
      const session = useUserSession().session
      session.value = { ...session.value, id: session.value?.id ?? current.platformSessionId!, user: current }
    } catch (cause: any) {
      if (cause?.response?.status === 401) { useUserSession().session.value = null; return navigateTo('/login') }
      throw cause
    }
  }
  const user = useUserSession().user.value as { isSuperuser?: boolean; inSystem?: boolean } | null
  if (to.path.startsWith('/system')) {
    if (!user?.isSuperuser) return navigateTo('/')
  } else if (user?.inSystem) return navigateTo('/system/clients')
})
