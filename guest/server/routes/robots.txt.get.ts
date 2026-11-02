import { catalogueRobots } from '#shared/seo'
import type { PublicSite } from '#shared/public-site'
import { catalogueRead } from '../utils/catalogue'
export default defineEventHandler(async event => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  try { return catalogueRobots((await catalogueRead<PublicSite>(event, 'site')).websiteUrl) }
  catch { return 'User-agent: *\nDisallow: /\n' }
})
