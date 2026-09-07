import { requireActor } from '../../../infrastructure/auth/actor'
import { createProblemTask } from '../../../modules/problem/problem.service'
export default defineEventHandler(async event => createProblemTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
