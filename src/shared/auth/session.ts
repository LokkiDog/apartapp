export type SessionUser = { id: string, organizationId: string, name: string, email: string, roles: Array<'administrator' | 'manager' | 'cleaner'> }
export function useCurrentUser() { return useUserSession().user as Ref<SessionUser | null> }
export function canAccessWorkSection(user: Pick<SessionUser, 'roles'> | null | undefined) {
  return Boolean(user?.roles.some(role => role === 'administrator' || role === 'cleaner'))
}

export function usesManagerOnlyNavigation(user: Pick<SessionUser, 'roles'> | null | undefined) {
  return Boolean(
    user?.roles.includes('manager')
    && !user.roles.includes('administrator')
    && !user.roles.includes('cleaner')
  )
}
