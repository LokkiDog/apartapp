import { requireActor } from '../../infrastructure/auth/actor'
import { problemDashboard } from '../../modules/problem/problem.service'
export default defineEventHandler(async event => problemDashboard(await requireActor(event)))
