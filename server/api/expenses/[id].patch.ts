import { requireActor } from '../../infrastructure/auth/actor'
import { updateExpense } from '../../modules/finance/finance.service'

export default defineEventHandler(async event => updateExpense(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
