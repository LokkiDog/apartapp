import { requireActor } from '../../infrastructure/auth/actor'
import { deleteStay } from '../../modules/stay/stay.service'
export default defineEventHandler(async event => deleteStay(await requireActor(event), getRouterParam(event, 'id')!))
