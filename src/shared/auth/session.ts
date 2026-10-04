import type { AppLocale } from '@contracts/crm'

export type SessionUser = { id: string, organizationId: string, isSuperuser?: boolean, inSystem?: boolean, organizationName?: string, organizationStatus?: 'active' | 'blocked', contextRevision?: string, platformSessionId?: string, sessionVersion?: number, name: string, email: string, roles: Array<'administrator' | 'manager' | 'cleaner' | 'specialist'>, locale: AppLocale }
export function useCurrentUser() { return useUserSession().user as Ref<SessionUser | null> }
export function canAccessWorkSection(user: Pick<SessionUser, 'roles'> | null | undefined) {
  return Boolean(user?.roles.some(role => role === 'administrator' || role === 'cleaner' || role === 'specialist'))
}

export function usesManagerOnlyNavigation(user: Pick<SessionUser, 'roles'> | null | undefined) {
  return Boolean(
    user?.roles.includes('manager')
    && !user.roles.includes('administrator')
    && !user.roles.includes('cleaner')
    && !user.roles.includes('specialist')
  )
}

export async function switchClientContext(organizationId: string | null) {
  await $fetch('/api/system/context', { method: 'POST', body: { organizationId } })
  if (import.meta.client) {
    const channel = new BroadcastChannel('aparts-client-context')
    channel.postMessage({ type: 'changed' })
    channel.close()
    // A new document discards requests, page state and realtime subscriptions.
    window.location.assign(organizationId ? '/' : '/system/clients')
  }
}

export function clientResourceUrl(url: string) {
  const user = useCurrentUser().value
  if (!user?.isSuperuser || user.inSystem) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}clientContext=${encodeURIComponent(`${user.organizationId}:${user.contextRevision}`)}`
}
