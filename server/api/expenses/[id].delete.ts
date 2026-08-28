import { requireActor } from '../../infrastructure/auth/actor'
import { deleteExpense } from '../../modules/finance/finance.service'

export default defineEventHandler(async event => deleteExpense(await requireActor(event), getRouterParam(event, 'id')!))
