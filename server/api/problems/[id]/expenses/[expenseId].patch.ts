import { requireActor } from '../../../../infrastructure/auth/actor'
import { updateProblemExpense } from '../../../../modules/problem/problem.service'

export default defineEventHandler(async event => updateProblemExpense(await requireActor(event), getRouterParam(event, 'id')!, getRouterParam(event, 'expenseId')!, await readBody(event)))
