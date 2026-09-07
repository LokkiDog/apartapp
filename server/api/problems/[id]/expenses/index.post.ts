import { requireActor } from '../../../../infrastructure/auth/actor'
import { createProblemExpense } from '../../../../modules/problem/problem.service'

export default defineEventHandler(async event => createProblemExpense(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
