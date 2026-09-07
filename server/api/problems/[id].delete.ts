import { requireActor } from '../../infrastructure/auth/actor'
import { deleteProblem } from '../../modules/problem/problem.service'

export default defineEventHandler(async event => deleteProblem(await requireActor(event), getRouterParam(event, 'id')!))
