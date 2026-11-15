import { and, eq } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import { users, organizations, platformSessions } from '../../../infrastructure/database/schema'
import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { registerNotificationPeer, unregisterNotificationPeer } from '../../../infrastructure/notification/realtime'
import { subscribeToDatabaseEvents } from '../../../infrastructure/notification/database-events'
import { messagingUnreadCount, notificationUnreadCount } from '../../../infrastructure/notification/unread-count'

type RealtimeActor = { id: string; organizationId: string; platformSessionId: string; contextRevision: string; isSuperuser: boolean }

type UpgradeRequest = { url: string; headers: Headers; context: Record<string, unknown> }

async function requireRealtimeActor(request: UpgradeRequest): Promise<RealtimeActor> {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host || new URL(origin).host !== host) throw new Response('Forbidden', { status: 403 })

  const actor = await requirePrincipal(request as unknown as Parameters<typeof requirePrincipal>[0], false)
  if (actor.inSystem) throw new Response('Forbidden', { status: 403 })
  const revision = new URL(request.url, `https://${host}`).searchParams.get('clientContext')
  if (actor.isSuperuser && revision !== `${actor.organizationId}:${actor.contextRevision}`) throw new Response('Conflict', { status: 409 })
  return { id: actor.id, organizationId: actor.organizationId, platformSessionId: actor.platformSessionId!, contextRevision: actor.contextRevision!, isSuperuser: Boolean(actor.isSuperuser) }
}

function actorFromPeer(peer: { context: Record<string, unknown> }) {
  return peer.context.actor as RealtimeActor
}

export default defineWebSocketHandler({
  async upgrade(request) {
    request.context.actor = await requireRealtimeActor(request)
  },
  open(peer) {
    const actor = actorFromPeer(peer)
    registerNotificationPeer(actor.id, peer)
    const { id, organizationId, platformSessionId } = actor
    let closed = false
    let running = false
    let stopMessaging: (() => void) | undefined
    let changeTimer: ReturnType<typeof setTimeout> | undefined
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const pending = new Set<'notifications' | 'messaging'>()

    async function flush() {
      changeTimer = undefined
      if (closed || running || !pending.size) return
      running = true
      const changes = new Set(pending)
      pending.clear()
      try {
        const [access] = await db.select({
          expiresAt: platformSessions.expiresAt,
          messagingEnabled: organizations.messagingEnabled,
          organizationStatus: organizations.status,
          roles: users.roles,
        }).from(platformSessions)
          .innerJoin(users, and(eq(users.id, platformSessions.userId), eq(users.status, 'active')))
          .innerJoin(organizations, eq(organizations.id, platformSessions.organizationId))
          .where(and(
            eq(platformSessions.id, platformSessionId),
            eq(platformSessions.revision, actor.contextRevision),
            eq(users.id, id),
            eq(users.isSuperuser, actor.isSuperuser),
            eq(organizations.id, organizationId),
            actor.isSuperuser ? undefined : eq(users.organizationId, organizationId),
          ))
        if (closed) return
        if (!access || access.expiresAt.getTime() <= Date.now() || (!actor.isSuperuser && access.organizationStatus !== 'active')) {
          peer.close(1008, 'Session revoked')
          return
        }

        clearTimeout(expiryTimer)
        expiryTimer = setTimeout(refreshAll, Math.min(access.expiresAt.getTime() - Date.now(), 2_147_483_647))

        const canReadMessages = access.organizationStatus === 'active' && access.messagingEnabled
          && (actor.isSuperuser || access.roles.includes('administrator'))
        if (canReadMessages) {
          stopMessaging ??= subscribeToDatabaseEvents(`messaging:${organizationId}`, () => schedule('messaging'))
        } else {
          stopMessaging?.()
          stopMessaging = undefined
        }
        const [notifications, messaging] = await Promise.all([
          changes.has('notifications') ? notificationUnreadCount(organizationId, id) : undefined,
          changes.has('messaging') ? (canReadMessages ? messagingUnreadCount(organizationId) : null) : undefined,
        ])
        if (closed) return
        if (notifications !== undefined) peer.send({ type: 'notifications.unread-count', count: notifications })
        if (messaging !== undefined) peer.send({ type: 'messaging.unread-count', count: messaging })
      } catch {
        if (!closed) peer.close(1011, 'Realtime sync failed')
      } finally {
        running = false
        if (!closed && pending.size && !changeTimer) changeTimer = setTimeout(flush, 50)
      }
    }

    function schedule(...changes: Array<'notifications' | 'messaging'>) {
      for (const change of changes) pending.add(change)
      if (!running && !changeTimer) changeTimer = setTimeout(flush, 50)
    }
    function refreshAll() {
      schedule('notifications', 'messaging')
    }

    const unsubscribe = [
      subscribeToDatabaseEvents(`notifications:${organizationId}:${id}`, () => schedule('notifications')),
      subscribeToDatabaseEvents(`users:${id}`, refreshAll),
      subscribeToDatabaseEvents(`organizations:${organizationId}`, refreshAll),
      subscribeToDatabaseEvents(`platform_sessions:${platformSessionId}`, refreshAll),
    ]
    peer.context.cleanup = () => {
      if (closed) return
      closed = true
      stopMessaging?.()
      clearTimeout(changeTimer)
      clearTimeout(expiryTimer)
      for (const stop of unsubscribe) stop()
      unregisterNotificationPeer(id, peer)
    }
    refreshAll()
  },
  close(peer) {
    const cleanup = peer.context.cleanup as (() => void) | undefined
    cleanup?.()
  },
  error(peer) {
    const cleanup = peer.context.cleanup as (() => void) | undefined
    cleanup?.()
  },
  message(peer) {
    peer.close(1008, 'Notifications channel is read-only')
  }
})
