export type NotificationRealtimeMessage =
  | { type: 'notification.created'; notification: { id: string; type: string; title: string; body: string; href: string; readAt: string | null; createdAt: string } }
  | { type: 'notification.read'; id: string; readAt: string }
  | { type: 'notifications.read-all'; readAt: string }
  | { type: 'notifications.heartbeat' }

type NotificationPeer = { id: string; send: (data: NotificationRealtimeMessage) => void }

const peersByUser = new Map<string, Set<NotificationPeer>>()
const heartbeats = new Map<string, ReturnType<typeof setInterval>>()

export function registerNotificationPeer(userId: string, peer: NotificationPeer) {
  const peers = peersByUser.get(userId) ?? new Set<NotificationPeer>()
  peers.add(peer)
  peersByUser.set(userId, peers)
  heartbeats.set(peer.id, setInterval(() => peer.send({ type: 'notifications.heartbeat' }), 25_000))
}

export function unregisterNotificationPeer(userId: string, peer: NotificationPeer) {
  const peers = peersByUser.get(userId)
  peers?.delete(peer)
  if (!peers?.size) peersByUser.delete(userId)
  const heartbeat = heartbeats.get(peer.id)
  if (heartbeat) clearInterval(heartbeat)
  heartbeats.delete(peer.id)
}

export function publishNotification(userId: string, message: NotificationRealtimeMessage) {
  for (const peer of peersByUser.get(userId) ?? []) {
    try {
      peer.send(message)
    } catch {
      unregisterNotificationPeer(userId, peer)
    }
  }
}
