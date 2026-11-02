import { publicHostPhoto } from '../../modules/publication/public-site.service'
export default defineEventHandler(async event => {
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'content-type', 'image/webp')
  return publicHostPhoto(getQuery(event).site)
})
