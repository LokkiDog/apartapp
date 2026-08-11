function base64UrlToUint8Array(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

export function usePushSubscription() {
  const pending = ref(false)
  const supported = ref(false)
  onMounted(() => {
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  })
  async function subscribe() {
    const key = useRuntimeConfig().public.vapidPublicKey
    if (!supported.value || !key) return false
    pending.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(key) })
      await $fetch('/api/push-subscriptions', { method: 'POST', body: subscription.toJSON() })
      return true
    } finally { pending.value = false }
  }
  return { pending, supported, subscribe }
}
