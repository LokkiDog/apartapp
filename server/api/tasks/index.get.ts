import { requireActor } from '../../infrastructure/auth/actor'
import { listTasks } from '../../modules/task/task.service'
import { workListQuerySchema } from '@contracts/crm'
export default defineEventHandler(async event => listTasks(await requireActor(event), workListQuerySchema.parse(getQuery(event))))
