export function useNetworkStatus() {
  const online = useState<boolean>('network-online', () => true)
  if (import.meta.client) {
    const update = () => { online.value = navigator.onLine }
    onMounted(() => {
      update()
      window.addEventListener('online', update)
      window.addEventListener('offline', update)
    })
    onUnmounted(() => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    })
  }
  return online
}
