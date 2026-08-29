function base64UrlToUint8Array(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

export function usePushSubscription() {
  const pending = useState('push-subscription-pending', () => false)
  const supported = useState('push-subscription-supported', () => false)
  const permission = useState<NotificationPermission | 'unsupported'>('push-subscription-permission', () => 'unsupported')
  const subscribed = useState('push-subscription-subscribed', () => false)
  const error = useState('push-subscription-error', () => '')

  async function registration() {
    return navigator.serviceWorker.ready
  }

  async function save(subscription: PushSubscription) {
    await $fetch('/api/push-subscriptions', { method: 'POST', body: subscription.toJSON() })
  }

  async function refresh() {
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported.value) {
      permission.value = 'unsupported'
      return
    }
    permission.value = Notification.permission
    const current = await (await registration()).pushManager.getSubscription()
    subscribed.value = Boolean(current)
    if (current && permission.value === 'granted') await save(current)
  }

  onMounted(() => { void refresh() })

  async function subscribe() {
    const key = useRuntimeConfig().public.vapidPublicKey
    if (!supported.value || !key) return false
    pending.value = true
    error.value = ''
    try {
      const nextPermission = await Notification.requestPermission()
      permission.value = nextPermission
      if (nextPermission !== 'granted') return false
      const activeRegistration = await registration()
      const subscription = await activeRegistration.pushManager.getSubscription() ?? await activeRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(key) })
      await save(subscription)
      subscribed.value = true
      return true
    } catch {
      error.value = 'error'
      return false
    } finally { pending.value = false }
  }

  async function unregister({ unsubscribe = false } = {}) {
    if (!supported.value) return
    const current = await (await registration()).pushManager.getSubscription()
    if (!current) return
    await $fetch('/api/push-subscriptions', { method: 'DELETE', body: { endpoint: current.endpoint } })
    if (unsubscribe) await current.unsubscribe()
    subscribed.value = false
  }

  async function unsubscribe() {
    pending.value = true
    error.value = ''
    try {
      await unregister({ unsubscribe: true })
    } catch {
      error.value = 'error'
    } finally { pending.value = false }
  }

  const canSubscribe = computed(() => supported.value && permission.value !== 'denied' && !subscribed.value)
  const canUnsubscribe = computed(() => supported.value && subscribed.value)
  const visible = computed(() => supported.value && (permission.value !== 'granted' || subscribed.value || Boolean(error.value)))
  const description = computed(() => {
    if (error.value) return 'error'
    if (permission.value === 'denied') return 'denied'
    if (subscribed.value) return 'enabled'
    return 'ready'
  })
  return { pending, supported, permission, subscribed, error, visible, canSubscribe, canUnsubscribe, description, refresh, subscribe, unsubscribe, unregister }
}

export async function unregisterPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return
  const current = await registration.pushManager.getSubscription()
  if (current) await $fetch('/api/push-subscriptions', { method: 'DELETE', body: { endpoint: current.endpoint }, timeout: 1500 }).catch(() => undefined)
}
