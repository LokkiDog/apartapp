import { requireActor } from '../../../infrastructure/auth/actor'
import { resolveIcalConflict } from '../../../modules/calendar-import/ical.service'

export default defineEventHandler(async event => resolveIcalConflict(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
