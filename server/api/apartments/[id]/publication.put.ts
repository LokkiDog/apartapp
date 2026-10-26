import { requireActor } from '../../../infrastructure/auth/actor'
import { savePublication } from '../../../modules/publication/publication.service'
export default defineEventHandler(async event => savePublication(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
