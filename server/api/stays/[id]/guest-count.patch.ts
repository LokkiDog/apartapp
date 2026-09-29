import { requireActor } from '../../../infrastructure/auth/actor'
import { updateIcalGuestCount } from '../../../modules/calendar-import/ical.service'

export default defineEventHandler(async event => updateIcalGuestCount(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
