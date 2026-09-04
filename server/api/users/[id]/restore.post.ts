import { getRouterParam } from 'h3'
import { requireActor } from '../../../infrastructure/auth/actor'
import { restoreUser } from '../../../modules/auth/account.service'

export default defineEventHandler(async event => restoreUser(await requireActor(event), getRouterParam(event, 'id')!))
