import { requireActor } from '../../../infrastructure/auth/actor'
import { returnTaskToWork } from '../../../modules/task/task.service'

export default defineEventHandler(async event => returnTaskToWork(await requireActor(event), getRouterParam(event, 'id')!))
