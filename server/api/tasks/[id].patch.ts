import { requireActor } from '../../infrastructure/auth/actor'
import { updateTask } from '../../modules/task/task.service'
export default defineEventHandler(async event => updateTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
