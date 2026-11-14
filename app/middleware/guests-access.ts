import { useCurrentUser } from '#fsd/shared/auth'

export default defineNuxtRouteMiddleware(() => {
  const user = useCurrentUser()
  if (import.meta.server) return
  if (!user.value?.guestsEnabled || !user.value.roles.includes('administrator') || user.value.inSystem) return navigateTo('/')
})
