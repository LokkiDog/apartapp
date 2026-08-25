export type PwaInstallVariant = 'android' | 'ios' | null

export type PwaInstallContext = {
  userAgent: string
  platform: string
  maxTouchPoints: number
  isInstalled: boolean
  hasNativePrompt: boolean
  dismissed: boolean
}

export type IosZoomLockTarget = {
  addEventListener: (type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => void
  removeEventListener: (type: string, listener: EventListener, options?: EventListenerOptions | boolean) => void
}

export type IosZoomLockRoot = {
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
}

const INSTALL_DISMISSED_KEY = 'aparts-pwa-install-card-dismissed'
const IOS_INSTALL_DISMISSED_KEY = 'aparts-pwa-install-card-dismissed-ios-v2'

export function isIosDevice({ userAgent, platform, maxTouchPoints }: Pick<PwaInstallContext, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function isMobileDevice({ userAgent, platform, maxTouchPoints }: Pick<PwaInstallContext, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /Android|iPad|iPhone|iPod|Mobile/i.test(userAgent) || isIosDevice({ userAgent, platform, maxTouchPoints })
}

export function getPwaInstallDismissedKey(context: Pick<PwaInstallContext, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return isIosDevice(context) ? IOS_INSTALL_DISMISSED_KEY : INSTALL_DISMISSED_KEY
}

export function getPwaInstallVariant(context: PwaInstallContext): PwaInstallVariant {
  if (context.isInstalled || context.dismissed || !isMobileDevice(context)) return null
  if (isIosDevice(context)) return 'ios'
  return context.hasNativePrompt ? 'android' : null
}

export function installIosZoomLock(target: IosZoomLockTarget, root: IosZoomLockRoot, now = Date.now) {
  let lastTap: { at: number, x: number, y: number } | null = null

  const preventGesture = (event: Event) => event.preventDefault()
  const preventMultiTouch = (event: Event) => {
    if ((event as TouchEvent).touches?.length > 1) event.preventDefault()
  }
  const preventDoubleTap = (event: Event) => {
    const touch = (event as TouchEvent).changedTouches?.[0]
    if (!touch) return

    const tap = { at: now(), x: touch.clientX, y: touch.clientY }
    const isRapidNearbyTap = lastTap
      && tap.at - lastTap.at <= 300
      && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= 24

    if (isRapidNearbyTap) event.preventDefault()
    lastTap = tap
  }

  root.setAttribute('data-ios-zoom-locked', '')
  target.addEventListener('gesturestart', preventGesture, { passive: false })
  target.addEventListener('gesturechange', preventGesture, { passive: false })
  target.addEventListener('gestureend', preventGesture, { passive: false })
  target.addEventListener('touchmove', preventMultiTouch, { passive: false })
  target.addEventListener('touchend', preventDoubleTap, { passive: false })

  return () => {
    root.removeAttribute('data-ios-zoom-locked')
    target.removeEventListener('gesturestart', preventGesture)
    target.removeEventListener('gesturechange', preventGesture)
    target.removeEventListener('gestureend', preventGesture)
    target.removeEventListener('touchmove', preventMultiTouch)
    target.removeEventListener('touchend', preventDoubleTap)
  }
}
