import { describe, expect, it } from 'vitest'
import { getPwaInstallDismissedKey, getPwaInstallVariant, installIosZoomLock, isIosDevice, isMobileDevice, isStandalonePwa } from '../src/features/install-pwa/model/install-pwa'

const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }

class ZoomTarget {
  private listeners = new Map<string, Set<EventListener>>()

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: Event) {
    this.listeners.get(type)?.forEach(listener => listener(event))
  }
}

class ZoomRoot {
  locked = false

  setAttribute(name: string) {
    if (name === 'data-ios-zoom-locked') this.locked = true
  }

  removeAttribute(name: string) {
    if (name === 'data-ios-zoom-locked') this.locked = false
  }
}

describe('PWA installation prompt', () => {
  it('shows the native prompt only on a mobile device when Chromium supplies it', () => {
    expect(getPwaInstallVariant({ ...android, isInstalled: false, hasNativePrompt: true, dismissed: false })).toBe('android')
    expect(getPwaInstallVariant({ ...android, isInstalled: false, hasNativePrompt: false, dismissed: false })).toBeNull()
  })

  it('shows manual instructions on iPhone and iPad', () => {
    expect(isIosDevice(iphone)).toBe(true)
    expect(isIosDevice(android)).toBe(false)
    expect(getPwaInstallVariant({ ...iphone, isInstalled: false, hasNativePrompt: false, dismissed: false })).toBe('ios')
    expect(isIosDevice({ userAgent: 'Mozilla/5.0', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })

  it('uses a new dismissal key only for the updated iOS instructions', () => {
    expect(getPwaInstallDismissedKey(iphone)).toBe('aparts-pwa-install-card-dismissed-ios-v2')
    expect(getPwaInstallDismissedKey({ userAgent: 'Mozilla/5.0', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('aparts-pwa-install-card-dismissed-ios-v2')
    expect(getPwaInstallDismissedKey(android)).toBe('aparts-pwa-install-card-dismissed')
  })

  it('hides the card after installation or dismissal and on desktop', () => {
    expect(getPwaInstallVariant({ ...android, isInstalled: true, hasNativePrompt: true, dismissed: false })).toBeNull()
    expect(getPwaInstallVariant({ ...iphone, isInstalled: true, hasNativePrompt: false, dismissed: false })).toBeNull()
    expect(getPwaInstallVariant({ ...iphone, isInstalled: false, hasNativePrompt: false, dismissed: true })).toBeNull()
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })

  it('distinguishes a browser tab from an installed standalone PWA', () => {
    expect(isStandalonePwa({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false)
    expect(isStandalonePwa({ displayModeStandalone: true })).toBe(true)
    expect(isStandalonePwa({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true)
  })

  it('prevents iOS pinch gestures and rapid double taps', () => {
    const target = new ZoomTarget()
    const root = new ZoomRoot()
    const touchEndTimes = [1_000, 1_200]
    const removeZoomLock = installIosZoomLock(target, root, () => touchEndTimes.shift() ?? 2_000)

    const gesture = new Event('gesturestart', { cancelable: true })
    target.dispatch('gesturestart', gesture)
    expect(gesture.defaultPrevented).toBe(true)

    const multiTouch = new Event('touchmove', { cancelable: true })
    Object.defineProperty(multiTouch, 'touches', { value: [{}, {}] })
    target.dispatch('touchmove', multiTouch)
    expect(multiTouch.defaultPrevented).toBe(true)

    const singleTouch = new Event('touchmove', { cancelable: true })
    Object.defineProperty(singleTouch, 'touches', { value: [{}] })
    target.dispatch('touchmove', singleTouch)
    expect(singleTouch.defaultPrevented).toBe(false)

    const firstTap = new Event('touchend', { cancelable: true })
    const secondTap = new Event('touchend', { cancelable: true })
    Object.defineProperty(firstTap, 'changedTouches', { value: [{ clientX: 80, clientY: 120 }] })
    Object.defineProperty(secondTap, 'changedTouches', { value: [{ clientX: 84, clientY: 116 }] })
    target.dispatch('touchend', firstTap)
    target.dispatch('touchend', secondTap)
    expect(firstTap.defaultPrevented).toBe(false)
    expect(secondTap.defaultPrevented).toBe(true)
    expect(root.locked).toBe(true)

    const differentTargetTap = new Event('touchend', { cancelable: true })
    Object.defineProperty(differentTargetTap, 'changedTouches', { value: [{ clientX: 180, clientY: 220 }] })
    target.dispatch('touchend', differentTargetTap)
    expect(differentTargetTap.defaultPrevented).toBe(false)

    removeZoomLock()

    const gestureAfterCleanup = new Event('gesturestart', { cancelable: true })
    target.dispatch('gesturestart', gestureAfterCleanup)
    expect(gestureAfterCleanup.defaultPrevented).toBe(false)
    expect(root.locked).toBe(false)
  })
})
