import { requireActor } from '../../../infrastructure/auth/actor'
import { getPublication } from '../../../modules/publication/publication.service'
export default defineEventHandler(async event => getPublication(await requireActor(event), getRouterParam(event, 'id')!))
