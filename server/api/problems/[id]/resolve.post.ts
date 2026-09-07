import { requireActor } from '../../../infrastructure/auth/actor'
import { resolveProblem } from '../../../modules/problem/problem.service'

export default defineEventHandler(async event => resolveProblem(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
