import { getQuery } from 'h3'
import { publicCatalogue } from '../../../modules/publication/publication.service'
export default defineEventHandler(event => {
  const locale = getQuery(event).locale
  return publicCatalogue(useRuntimeConfig(event).catalogueOrganizationId, undefined, typeof locale === 'string' ? locale : 'ru')
})
