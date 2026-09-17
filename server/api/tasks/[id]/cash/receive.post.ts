import { requireActor } from '../../../../infrastructure/auth/actor'
import { receiveCashTask } from '../../../../modules/task/cash-task.service'

export default defineEventHandler(async event => receiveCashTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
