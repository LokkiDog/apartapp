import { requireActor } from '../../../../infrastructure/auth/actor'
import { deleteProblemExpense } from '../../../../modules/problem/problem.service'

export default defineEventHandler(async event => deleteProblemExpense(await requireActor(event), getRouterParam(event, 'id')!, getRouterParam(event, 'expenseId')!))
