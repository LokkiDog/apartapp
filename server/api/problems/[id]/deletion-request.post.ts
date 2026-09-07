import { requireActor } from '../../../infrastructure/auth/actor'
import { requestProblemDeletion } from '../../../modules/problem/problem.service'
export default defineEventHandler(async event => requestProblemDeletion(await requireActor(event), getRouterParam(event, 'id')!))
