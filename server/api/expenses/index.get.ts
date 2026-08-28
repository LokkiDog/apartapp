import { requireActor } from '../../infrastructure/auth/actor'
import { listExpenses } from '../../modules/finance/finance.service'

export default defineEventHandler(async event => listExpenses(await requireActor(event), getQuery(event)))
