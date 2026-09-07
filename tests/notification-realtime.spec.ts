import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishNotification, registerNotificationPeer, unregisterNotificationPeer } from '../server/infrastructure/notification/realtime'

describe('notification realtime broker', () => {
  afterEach(() => vi.useRealTimers())

  it('delivers events only to sockets of the addressed user', () => {
    const first = { id: 'first', send: vi.fn() }
    const second = { id: 'second', send: vi.fn() }
    registerNotificationPeer('user-a', first)
    registerNotificationPeer('user-b', second)

    publishNotification('user-a', { type: 'notification.read', id: 'notification-a', readAt: '2026-08-29T00:00:00.000Z' })

    expect(first.send).toHaveBeenCalledWith({ type: 'notification.read', id: 'notification-a', readAt: '2026-08-29T00:00:00.000Z' })
    expect(second.send).not.toHaveBeenCalled()
    unregisterNotificationPeer('user-a', first)
    unregisterNotificationPeer('user-b', second)
  })

  it('keeps the connection alive and stops after it closes', () => {
    vi.useFakeTimers()
    const peer = { id: 'heartbeat', send: vi.fn() }
    registerNotificationPeer('user-a', peer)

    vi.advanceTimersByTime(25_000)
    expect(peer.send).toHaveBeenCalledWith({ type: 'notifications.heartbeat' })

    unregisterNotificationPeer('user-a', peer)
    peer.send.mockClear()
    vi.advanceTimersByTime(25_000)
    expect(peer.send).not.toHaveBeenCalled()
  })

  it('delivers a session revocation only to the archived user', () => {
    const archivedUser = { id: 'archived-user', send: vi.fn() }
    const otherUser = { id: 'other-user', send: vi.fn() }
    registerNotificationPeer('user-a', archivedUser)
    registerNotificationPeer('user-b', otherUser)

    publishNotification('user-a', { type: 'session.revoked', reason: 'archived' })

    expect(archivedUser.send).toHaveBeenCalledWith({ type: 'session.revoked', reason: 'archived' })
    expect(otherUser.send).not.toHaveBeenCalled()
    unregisterNotificationPeer('user-a', archivedUser)
    unregisterNotificationPeer('user-b', otherUser)
  })

  it('delivers a cleaning change only to addressed users', () => {
    const addressed = { id: 'cleaning-addressed', send: vi.fn() }
    const unrelated = { id: 'cleaning-unrelated', send: vi.fn() }
    registerNotificationPeer('user-a', addressed)
    registerNotificationPeer('user-b', unrelated)

    const message = { type: 'cleaning.changed', cleaningId: 'cleaning-a', reason: 'accepted', occurredAt: '2026-09-07T00:00:00.000Z' } as const
    publishNotification('user-a', message)

    expect(addressed.send).toHaveBeenCalledWith(message)
    expect(unrelated.send).not.toHaveBeenCalled()
    unregisterNotificationPeer('user-a', addressed)
    unregisterNotificationPeer('user-b', unrelated)
  })
})
