export type SessionUser = { id: string, organizationId: string, name: string, email: string, roles: Array<'administrator' | 'manager' | 'cleaner'> }
export function useCurrentUser() { return useUserSession().user as Ref<SessionUser | null> }
