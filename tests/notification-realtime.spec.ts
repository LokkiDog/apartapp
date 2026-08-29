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
})
