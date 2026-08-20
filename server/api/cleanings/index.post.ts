import { requireActor } from '../../infrastructure/auth/actor'
import { createCleaning } from '../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => createCleaning(await requireActor(event), await readBody(event)))
