import { requireActor } from '../../infrastructure/auth/actor'
import { updateProblem } from '../../modules/problem/problem.service'

export default defineEventHandler(async event => updateProblem(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
