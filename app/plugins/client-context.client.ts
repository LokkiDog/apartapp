import { useCurrentUser } from '#fsd/shared/auth'
export default defineNuxtPlugin({
  name: 'client-context',
  enforce: 'pre',
  setup() {
    const user = useCurrentUser()
    const original = globalThis.$fetch
    globalThis.$fetch = original.create({
      onRequest({ request, options }) {
        if (typeof request === 'string' && request.startsWith('/api/') && user.value?.isSuperuser && !user.value.inSystem) {
          options.headers = new Headers(options.headers)
          options.headers.set('x-client-context', `${user.value.organizationId}:${user.value.contextRevision}`)
        }
      },
      onResponseError({ response }) {
        if (response._data?.data?.code === 'CLIENT_CONTEXT_CHANGED') window.location.reload()
      }
    })
    const channel = new BroadcastChannel('aparts-client-context')
    channel.onmessage = () => window.location.reload()
    watch(() => user.value?.id, (current, previous) => {
      if (previous && current !== previous) channel.postMessage({ type: 'changed' })
    })
    window.addEventListener('pagehide', () => channel.close(), { once: true })
  }
})
