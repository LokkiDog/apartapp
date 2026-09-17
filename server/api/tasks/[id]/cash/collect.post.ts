import { requireActor } from '../../../../infrastructure/auth/actor'
import { collectCashTask } from '../../../../modules/task/cash-task.service'

export default defineEventHandler(async event => collectCashTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
