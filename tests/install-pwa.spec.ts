import { describe, expect, it } from 'vitest'
import { getPwaInstallVariant, isIosDevice, isMobileDevice } from '../src/features/install-pwa/model/install-pwa'

const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }

describe('PWA installation prompt', () => {
  it('shows the native prompt only on a mobile device when Chromium supplies it', () => {
    expect(getPwaInstallVariant({ ...android, isInstalled: false, hasNativePrompt: true, dismissed: false })).toBe('android')
    expect(getPwaInstallVariant({ ...android, isInstalled: false, hasNativePrompt: false, dismissed: false })).toBeNull()
  })

  it('shows manual instructions on iPhone and iPad', () => {
    expect(isIosDevice(iphone)).toBe(true)
    expect(getPwaInstallVariant({ ...iphone, isInstalled: false, hasNativePrompt: false, dismissed: false })).toBe('ios')
    expect(isIosDevice({ userAgent: 'Mozilla/5.0', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })

  it('hides the card after installation or dismissal and on desktop', () => {
    expect(getPwaInstallVariant({ ...android, isInstalled: true, hasNativePrompt: true, dismissed: false })).toBeNull()
    expect(getPwaInstallVariant({ ...iphone, isInstalled: false, hasNativePrompt: false, dismissed: true })).toBeNull()
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
})
