import { requireActor } from '../../infrastructure/auth/actor'
import { savePublicSiteSettings } from '../../modules/publication/public-site.service'
export default defineEventHandler(async event => savePublicSiteSettings(await requireActor(event), await readBody(event)))
