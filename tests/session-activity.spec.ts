import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'

const setup = await (async () => {
  vi.stubGlobal('defineNuxtPlugin', (plugin: unknown) => plugin)
  return (await import('../app/plugins/session-activity.client')).default as unknown as () => void
})()

const request = vi.fn()
const navigate = vi.fn()
let windowTarget: EventTarget
let documentTarget: EventTarget & { visibilityState: string }
let session: ReturnType<typeof ref>

async function interact(event = 'pointerdown') {
  windowTarget.dispatchEvent(new Event(event))
  await Promise.resolve()
  await Promise.resolve()
}

describe('session activity in web and PWA', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'))
    request.mockReset().mockResolvedValue({ id: 'user-1' })
    navigate.mockReset()
    windowTarget = new EventTarget()
    documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    session = ref({ user: { id: 'user-1' } })
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('document', documentTarget)
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('$fetch', request)
    vi.stubGlobal('navigateTo', navigate)
    vi.stubGlobal('useUserSession', () => ({ user: ref({ id: 'user-1' }), session }))
    setup()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renews on opening and user interaction, but not while idle', async () => {
    expect(request).toHaveBeenCalledWith('/api/auth/me', { retry: false })
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(request).toHaveBeenCalledTimes(1)
    await interact('keydown')
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('limits bursts to one renewal per minute and records trailing activity', async () => {
    await vi.advanceTimersByTimeAsync(10_000)
    await interact()
    await interact('scroll')
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not renew in the background and renews when the app is reopened', async () => {
    documentTarget.visibilityState = 'hidden'
    await vi.advanceTimersByTimeAsync(120_000)
    await interact()
    expect(request).toHaveBeenCalledTimes(1)
    documentTarget.visibilityState = 'visible'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('keeps the session after connection and server errors', async () => {
    await vi.advanceTimersByTimeAsync(60_000)
    request.mockRejectedValueOnce(new Error('Network error'))
    await interact()
    expect(session.value.user.id).toBe('user-1')
    expect(navigate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    request.mockRejectedValueOnce({ response: { status: 503 } })
    await interact()
    expect(session.value.user.id).toBe('user-1')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('requires login after the server confirms expiration', async () => {
    await vi.advanceTimersByTimeAsync(60_000)
    request.mockRejectedValueOnce({ response: { status: 401 } })
    await interact()
    expect(session.value).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/login')
  })
})
