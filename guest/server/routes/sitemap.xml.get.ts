import { catalogueSitemap } from '#shared/seo'
import type { PublicApartment } from '#shared/catalogue'
import type { PublicSite } from '#shared/public-site'
import { catalogueRead } from '../utils/catalogue'
export default defineEventHandler(async event => {
  const [site, apartments] = await Promise.all([catalogueRead<PublicSite>(event, 'site'), catalogueRead<PublicApartment[]>(event, 'apartments')])
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return catalogueSitemap(site.websiteUrl, apartments.map(apartment => apartment.slug))
})
