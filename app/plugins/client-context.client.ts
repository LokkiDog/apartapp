import { getClientContextChannel, useCurrentUser } from '#fsd/shared/auth'
export default defineNuxtPlugin({
  name: 'client-context',
  enforce: 'pre',
  setup() {
    const user = useCurrentUser()
    const fetch = window.fetch.bind(window)
    // Nuxt's auto-imported $fetch keeps its original instance and calls window.fetch.
    window.fetch = async (request, options) => {
      const current = user.value
      if (!current?.isSuperuser || current.inSystem) return fetch(request, options)

      const url = new URL(request instanceof Request ? request.url : request, window.location.href)
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return fetch(request, options)

      const headers = new Headers(options?.headers ?? (request instanceof Request ? request.headers : undefined))
      headers.set('x-client-context', `${current.organizationId}:${current.contextRevision}`)
      const response = await fetch(request, { ...options, headers })
      if (response.status === 409) {
        const error = await response.clone().json().catch(() => null)
        if (error?.data?.code === 'CLIENT_CONTEXT_CHANGED') window.location.reload()
      }
      return response
    }
    const channel = getClientContextChannel()
    if (!channel) return
    channel.onmessage = () => window.location.reload()
    watch(() => user.value?.id, (current, previous) => {
      if (previous && current !== previous) channel.postMessage({ type: 'changed' })
    })
    window.addEventListener('pagehide', event => {
      if (!event.persisted) channel.close()
    })
  }
})
