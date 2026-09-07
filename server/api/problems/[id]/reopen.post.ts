import { requireActor } from '../../../infrastructure/auth/actor'
import { reopenProblem } from '../../../modules/problem/problem.service'

export default defineEventHandler(async event => reopenProblem(await requireActor(event), getRouterParam(event, 'id')!))
