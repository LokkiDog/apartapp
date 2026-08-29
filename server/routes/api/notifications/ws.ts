import { and, eq } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import { users } from '../../../infrastructure/database/schema'
import { registerNotificationPeer, unregisterNotificationPeer } from '../../../infrastructure/notification/realtime'

type RealtimeActor = { id: string; organizationId: string }

type UpgradeRequest = { url: string; headers: Headers; context: Record<string, unknown> }

async function requireRealtimeActor(request: UpgradeRequest): Promise<RealtimeActor> {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host || new URL(origin).host !== host) throw new Response('Forbidden', { status: 403 })

  const session = await requireUserSession(request as unknown as Parameters<typeof requireUserSession>[0])
  const userId = (session.user as { id?: string } | undefined)?.id
  if (!userId) throw new Response('Unauthorized', { status: 401 })

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.status, 'active')),
    columns: { id: true, organizationId: true }
  })
  if (!user) throw new Response('Unauthorized', { status: 401 })
  return user
}

function actorFromPeer(peer: { context: Record<string, unknown> }) {
  return peer.context.actor as RealtimeActor
}

export default defineWebSocketHandler({
  async upgrade(request) {
    request.context.actor = await requireRealtimeActor(request)
  },
  open(peer) {
    registerNotificationPeer(actorFromPeer(peer).id, peer)
  },
  close(peer) {
    unregisterNotificationPeer(actorFromPeer(peer).id, peer)
  },
  error(peer) {
    unregisterNotificationPeer(actorFromPeer(peer).id, peer)
  },
  message(peer) {
    peer.close(1008, 'Notifications channel is read-only')
  }
})
