import { installIosZoomLock, isIosDevice } from '#fsd/features/install-pwa'

export default defineNuxtPlugin((nuxtApp) => {
  const device = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  }

  if (!isIosDevice(device)) return

  const removeZoomLock = installIosZoomLock(document, document.documentElement)
  nuxtApp.vueApp.onUnmount(removeZoomLock)
})
