import { requireActor } from '../../infrastructure/auth/actor'
import { listIcalFeeds } from '../../modules/calendar-import/ical.service'

export default defineEventHandler(async event => listIcalFeeds(await requireActor(event)))
