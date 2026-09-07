import { requireActor } from '../../infrastructure/auth/actor'
import { listProblems } from '../../modules/problem/problem.service'

export default defineEventHandler(async event => listProblems(await requireActor(event), getQuery(event)))
