import { requireActor } from '../../infrastructure/auth/actor'
import { createTask } from '../../modules/task/task.service'
export default defineEventHandler(async event => createTask(await requireActor(event), await readBody(event)))
