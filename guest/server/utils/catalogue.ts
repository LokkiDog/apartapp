import { getRequestURL, type H3Event } from 'h3'

export function catalogueOrigin(event: H3Event) {
  // Host Nginx supplies Host and X-Forwarded-Proto; no tenant UUID comes from the browser.
  return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
}
export function catalogueRead<T>(event: H3Event, path: string) {
  const base = useRuntimeConfig(event).catalogueApiBase.replace(/\/$/, '')
  return $fetch<T>(`${base}/api/catalogue/${path}`, { query: { site: catalogueOrigin(event) }, timeout: 10000, retry: 0 })
}
