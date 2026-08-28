import { requireActor } from '../../infrastructure/auth/actor'
import { createExpense } from '../../modules/finance/finance.service'

export default defineEventHandler(async event => createExpense(await requireActor(event), await readBody(event)))
