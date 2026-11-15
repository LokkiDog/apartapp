import { sql } from '../database/client'

const subscriptions = new Map<string, Set<() => void>>()

export function subscribeToDatabaseEvents(scope: string, refresh: () => void) {
  const callbacks = subscriptions.get(scope) ?? new Set()
  callbacks.add(refresh)
  subscriptions.set(scope, callbacks)
  return () => {
    callbacks.delete(refresh)
    if (!callbacks.size) subscriptions.delete(scope)
  }
}

export function listenForDatabaseEvents() {
  return sql.listen('crm_realtime', scope => {
    for (const refresh of subscriptions.get(scope) ?? []) refresh()
  }, () => {
    // Recover changes committed while the listener connection was down.
    for (const callbacks of subscriptions.values()) {
      for (const refresh of callbacks) refresh()
    }
  })
}
