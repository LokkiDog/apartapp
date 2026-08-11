import { requireActor } from '../../../infrastructure/auth/actor'
import { completeTask } from '../../../modules/task/task.service'
export default defineEventHandler(async event => completeTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
