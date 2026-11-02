import { resolvePublicSite } from '../../../modules/publication/public-site.service'
import { getQuery } from 'h3'
import { publicCatalogue } from '../../../modules/publication/publication.service'
export default defineEventHandler(async event => {
  const locale = getQuery(event).locale
  return publicCatalogue((await resolvePublicSite(getQuery(event).site)).organizationId, undefined, typeof locale === 'string' ? locale : 'ru')
})
