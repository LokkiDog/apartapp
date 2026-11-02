import { catalogueSitemap } from '#shared/seo'
import type { PublicApartment } from '#shared/catalogue'

export default defineEventHandler(async event => {
  const apartments = await $fetch<PublicApartment[]>('/api/catalogue/apartments')
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return catalogueSitemap(useRuntimeConfig(event).public.siteUrl, apartments.map(apartment => apartment.slug))
})
