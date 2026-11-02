import { requireActor } from '../../infrastructure/auth/actor'
import { getPublicSiteSettings } from '../../modules/publication/public-site.service'
export default defineEventHandler(async event => getPublicSiteSettings(await requireActor(event)))
