import { type SessionUser, usesManagerOnlyNavigation } from '#fsd/shared/auth'

export default defineNuxtRouteMiddleware(() => {
  const user = useUserSession().user as Ref<SessionUser | null>
  if (usesManagerOnlyNavigation(user.value)) return navigateTo('/calendar')
  if (user.value?.roles.includes('specialist') && !user.value.roles.includes('administrator')) return navigateTo('/work')
})
