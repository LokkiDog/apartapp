import { requireActor } from '../../infrastructure/auth/actor'
import { createProblem } from '../../modules/problem/problem.service'

export default defineEventHandler(async event => createProblem(await requireActor(event), await readBody(event)))
