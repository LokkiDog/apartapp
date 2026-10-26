import { requireActor } from '../../infrastructure/auth/actor'
import { dashboardOperations } from '../../modules/dashboard/operations.service'

export default defineEventHandler(async event => dashboardOperations(await requireActor(event)))
