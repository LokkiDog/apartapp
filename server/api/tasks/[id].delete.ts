import { requireActor } from '../../infrastructure/auth/actor'
import { deleteTask } from '../../modules/task/task.service'

export default defineEventHandler(async event => deleteTask(await requireActor(event), getRouterParam(event, 'id')!))
