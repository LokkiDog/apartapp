import { publicSiteInfo } from '../../modules/publication/public-site.service'
export default defineEventHandler(async event => {
  setHeader(event, 'cache-control', 'no-store')
  return publicSiteInfo(getQuery(event).site)
})
