import { catalogueOrigin } from '../../utils/catalogue'
export default defineEventHandler(async (event): Promise<unknown> => {
  const path = getRouterParam(event, 'path') || ''
  // Only catalogue reads can reach the CRM; never forward guest cookies or arbitrary paths.
  if (!/^(?:site|host-photo|apartments(?:\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/photos\/[0-9a-f-]{36})?)?)$/.test(path)) throw createError({ statusCode: 404 })
  const base = useRuntimeConfig(event).catalogueApiBase.replace(/\/$/, '')
  try {
    const locale = getQuery(event).locale
    const response = await $fetch.raw<unknown>(`${base}/api/catalogue/${path}`, { query: { site: catalogueOrigin(event), ...(typeof locale === 'string' ? { locale } : {}) }, timeout: 10000, retry: 0, responseType: (path.includes('/photos/') || path === 'host-photo') ? 'arrayBuffer' : 'json' })
    setHeader(event, 'cache-control', 'no-store')
    if ((path.includes('/photos/') || path === 'host-photo')) { setHeader(event, 'content-type', 'image/webp'); return Buffer.from(response._data as ArrayBuffer) }
    return response._data
  } catch (error: any) { throw createError({ statusCode: error?.statusCode === 404 ? 404 : 503, statusMessage: error?.statusCode === 404 ? 'Не найдено' : 'Каталог временно недоступен' }) }
})
