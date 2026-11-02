import { catalogueRobots } from '#shared/seo'

export default defineEventHandler(event => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return catalogueRobots(useRuntimeConfig(event).public.siteUrl)
})
