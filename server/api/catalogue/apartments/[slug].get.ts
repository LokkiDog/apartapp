import { resolvePublicSite } from '../../../modules/publication/public-site.service'
import { getQuery } from 'h3'
import { publicCatalogue } from '../../../modules/publication/publication.service'
export default defineEventHandler(async event => {
  const locale = getQuery(event).locale
  const [apartment] = await publicCatalogue((await resolvePublicSite(getQuery(event).site)).organizationId, getRouterParam(event, 'slug')!, typeof locale === 'string' ? locale : 'ru')
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment
})
