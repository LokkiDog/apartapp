import { requireActor } from '../../../infrastructure/auth/actor'
import { acceptCleaning } from '../../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => acceptCleaning(await requireActor(event), getRouterParam(event, 'id')!))
