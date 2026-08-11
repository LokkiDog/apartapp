import { requireActor } from '../../infrastructure/auth/actor'
import { listCleanings } from '../../modules/cleaning/cleaning.service'
export default defineEventHandler(async event => listCleanings(await requireActor(event)))
