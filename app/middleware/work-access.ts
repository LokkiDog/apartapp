import { canAccessWorkSection, type SessionUser } from '#fsd/shared/auth'

export default defineNuxtRouteMiddleware(() => {
  const user = useUserSession().user as Ref<SessionUser | null>
  if (!user.value) return
  if (!canAccessWorkSection(user.value)) return navigateTo('/calendar')
})
