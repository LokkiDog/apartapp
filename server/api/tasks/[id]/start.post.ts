import { requireActor } from '../../../infrastructure/auth/actor'
import { startTask } from '../../../modules/task/task.service'
export default defineEventHandler(async event => startTask(await requireActor(event), getRouterParam(event, 'id')!))
