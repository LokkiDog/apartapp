import { requireActor } from '../../../infrastructure/auth/actor'
import { saveTaskProgress } from '../../../modules/task/task.service'

export default defineEventHandler(async event => saveTaskProgress(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
