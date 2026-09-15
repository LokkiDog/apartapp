import { requireActor } from '../../../infrastructure/auth/actor'
import { closeTask } from '../../../modules/task/task.service'

export default defineEventHandler(async event => closeTask(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
