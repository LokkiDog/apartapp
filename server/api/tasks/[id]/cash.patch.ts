import { requireActor } from '../../../infrastructure/auth/actor'
import { correctCashTask } from '../../../modules/task/cash-task.service'

export default defineEventHandler(async event => correctCashTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
