import { canAccessWorkSection, type SessionUser } from '#fsd/shared/auth'

export default defineNuxtRouteMiddleware(() => {
  const user = useUserSession().user as Ref<SessionUser | null>
  if (!user.value || user.value.roles.some(role => role === 'administrator' || role === 'manager')) return
  return navigateTo(canAccessWorkSection(user.value) ? '/work' : '/')
})
