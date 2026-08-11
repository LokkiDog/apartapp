import { requireActor } from '../../infrastructure/auth/actor'
import { listTasks } from '../../modules/task/task.service'
export default defineEventHandler(async event => listTasks(await requireActor(event)))
