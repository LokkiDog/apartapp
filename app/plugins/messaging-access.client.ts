import { useCurrentUser } from '#fsd/shared/auth'

export default defineNuxtPlugin((nuxtApp) => {
  const user = useCurrentUser()
  const { session } = useUserSession()
  let pending = false
  async function refreshAccess() {
    const identity = user.value
    if (
      pending ||
      !identity ||
      identity.inSystem ||
      !identity.roles.includes('administrator') ||
      document.visibilityState !== 'visible' ||
      !navigator.onLine
    )
      return
    pending = true
    try {
      const result = await $fetch('/api/messaging/availability', {
        retry: false,
      })
      if (
        user.value?.id === identity.id &&
        user.value?.organizationId === identity.organizationId &&
        user.value?.contextRevision === identity.contextRevision &&
        user.value.messagingEnabled !== result.enabled
      )
        session.value = {
          ...session.value,
          id: session.value!.id,
          user: { ...user.value, messagingEnabled: result.enabled },
        }
    } catch {
      /* Protected endpoints still enforce the current server state. */
    } finally {
      pending = false
    }
  }
  const visibility = () => {
    if (document.visibilityState === 'visible') void refreshAccess()
  }
  document.addEventListener('visibilitychange', visibility)
  nuxtApp.hook('page:finish', () => {
    void refreshAccess()
  })
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      document.removeEventListener('visibilitychange', visibility)
    })
})
