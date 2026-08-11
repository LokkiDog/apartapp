import { requireActor } from '../../infrastructure/auth/actor'
import { createStay } from '../../modules/stay/stay.service'
export default defineEventHandler(async event => createStay(await requireActor(event), await readBody(event)))
