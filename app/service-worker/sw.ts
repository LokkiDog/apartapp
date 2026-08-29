/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }
self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', event => {
  const data = event.data?.json() as { id?: string; title?: string; body?: string; href?: string; timestamp?: string } | undefined
  event.waitUntil(self.registration.showNotification(data?.title || 'Aparts CRM', {
    body: data?.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data?.id ? `notification:${data.id}` : undefined,
    data: { href: data?.href || '/', timestamp: data?.timestamp }
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const href = String(event.notification.data?.href || '/')
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows: readonly Client[]) => {
    const matching = windows.find(window => new URL(window.url).pathname === href) as WindowClient | undefined
    return matching ? matching.focus() : self.clients.openWindow(href)
  }))
})
