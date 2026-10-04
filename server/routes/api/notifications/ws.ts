import { and, eq } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import { users, organizations, platformSessions } from '../../../infrastructure/database/schema'
import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { registerNotificationPeer, unregisterNotificationPeer } from '../../../infrastructure/notification/realtime'

type RealtimeActor = { id: string; organizationId: string; platformSessionId: string; contextRevision: string }

type UpgradeRequest = { url: string; headers: Headers; context: Record<string, unknown> }

async function requireRealtimeActor(request: UpgradeRequest): Promise<RealtimeActor> {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host || new URL(origin).host !== host) throw new Response('Forbidden', { status: 403 })

  const actor = await requirePrincipal(request as unknown as Parameters<typeof requirePrincipal>[0], false)
  if (actor.inSystem) throw new Response('Forbidden', { status: 403 })
  const revision = new URL(request.url, `https://${host}`).searchParams.get('clientContext')
  if (actor.isSuperuser && revision !== `${actor.organizationId}:${actor.contextRevision}`) throw new Response('Conflict', { status: 409 })
  return { id: actor.id, organizationId: actor.organizationId, platformSessionId: actor.platformSessionId!, contextRevision: actor.contextRevision! }

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
    // Revalidate on each process, including deployments with multiple replicas.
    peer.context.validationTimer = setInterval(async () => {
      try {
        const user = await db.query.users.findFirst({ where: eq(users.id, actor.id) })
        const session = await db.query.platformSessions.findFirst({ where: eq(platformSessions.id, actor.platformSessionId) })
        const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, actor.organizationId) })
        if (!user || user.status !== 'active' || !session || session.expiresAt <= new Date() || session.revision !== actor.contextRevision || (!user.isSuperuser && organization?.status !== 'active')) peer.close(1008, 'Session revoked')
      } catch { peer.close(1011, 'Session validation failed') }
    }, 5000)
  },
  close(peer) {
    clearInterval(peer.context.validationTimer as ReturnType<typeof setInterval>)
    unregisterNotificationPeer(actorFromPeer(peer).id, peer)
  },
  error(peer) {
    clearInterval(peer.context.validationTimer as ReturnType<typeof setInterval>)
    unregisterNotificationPeer(actorFromPeer(peer).id, peer)
  },
  message(peer) {
    peer.close(1008, 'Notifications channel is read-only')
  }
})
