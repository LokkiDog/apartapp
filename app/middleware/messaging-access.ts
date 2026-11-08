import { useCurrentUser } from '#fsd/shared/auth'
export default defineNuxtRouteMiddleware(async () => {
  // The client restores its session before checking the live entitlement.
  if (import.meta.server) return
  const user = useCurrentUser()
  if (!user.value?.roles.includes('administrator') || user.value.inSystem)
    return navigateTo('/')
  if (import.meta.client) {
    const result = await $fetch('/api/messaging/availability', { retry: false })
    const { session } = useUserSession()
    session.value = {
      ...session.value,
      id: session.value!.id,
      user: { ...user.value, messagingEnabled: result.enabled },
    }
    if (!result.enabled) return navigateTo('/')
  }
})
