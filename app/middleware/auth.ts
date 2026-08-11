export default defineNuxtRouteMiddleware(async to => {
  if (to.path === '/login') return
  const { loggedIn, fetch } = useUserSession()
  if (import.meta.client && !navigator.onLine) return
  if (!loggedIn.value) await fetch()
  if (!loggedIn.value) return navigateTo('/login')
})
