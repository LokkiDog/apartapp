import { requireActor } from '../../infrastructure/auth/actor'
import { configureIcalFeed } from '../../modules/calendar-import/ical.service'

export default defineEventHandler(async event => configureIcalFeed(await requireActor(event), getRouterParam(event, 'apartmentId')!, await readBody(event)))
