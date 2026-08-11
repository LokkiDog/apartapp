import { requireActor } from '../../../infrastructure/auth/actor'
import { archiveUser } from '../../../modules/auth/account.service'

export default defineEventHandler(async event => archiveUser(await requireActor(event), getRouterParam(event, 'id')!))
