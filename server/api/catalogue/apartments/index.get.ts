import { publicCatalogue } from '../../../modules/publication/publication.service'
export default defineEventHandler(event => publicCatalogue(useRuntimeConfig(event).catalogueOrganizationId))
