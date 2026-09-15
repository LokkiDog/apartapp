import { requireActor } from '../../infrastructure/auth/actor'
import { listCleanings } from '../../modules/cleaning/cleaning.service'
import { workListQuerySchema } from '@contracts/crm'
export default defineEventHandler(async event => listCleanings(await requireActor(event), workListQuerySchema.parse(getQuery(event))))
