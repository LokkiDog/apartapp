import { publicCatalogue } from '../../../modules/publication/publication.service'
export default defineEventHandler(async event => {
  const [apartment] = await publicCatalogue(useRuntimeConfig(event).catalogueOrganizationId, getRouterParam(event, 'slug')!)
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment
})
