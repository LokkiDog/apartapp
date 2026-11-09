import type { AppLocale } from '@contracts/crm'

export type SessionUser = { messagingEnabled?: boolean, id: string, organizationId: string, isSuperuser?: boolean, inSystem?: boolean, organizationName?: string, organizationStatus?: 'active' | 'blocked', contextRevision?: string, platformSessionId?: string, sessionVersion?: number, name: string, email: string, roles: Array<'administrator' | 'manager' | 'cleaner' | 'specialist'>, locale: AppLocale }
export function useCurrentUser() { return useUserSession().user as Ref<SessionUser | null> }
export function useCurrentUserScope() {
  const user = useCurrentUser()
  return computed(() => {
    const current = user.value
    if (!current) return null
    return JSON.stringify([
      current.id, current.platformSessionId, current.organizationId,
      current.contextRevision, current.inSystem, current.roles
    ])
  })
}
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

let clientContextChannel: BroadcastChannel | undefined

export function getClientContextChannel() {
  if (import.meta.client && typeof BroadcastChannel !== 'undefined') {
    clientContextChannel ??= new BroadcastChannel('aparts-client-context')
  }
  return clientContextChannel
}

export async function switchClientContext(organizationId: string | null) {
  await $fetch('/api/system/context', { method: 'POST', body: { organizationId } })
  if (import.meta.client) {
    // Use the listener's channel so this document does not receive its own message.
    getClientContextChannel()?.postMessage({ type: 'changed' })
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
