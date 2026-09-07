import { requireActor } from '../../infrastructure/auth/actor'
import { getProblem } from '../../modules/problem/problem.service'

export default defineEventHandler(async event => getProblem(await requireActor(event), getRouterParam(event, 'id')!))
