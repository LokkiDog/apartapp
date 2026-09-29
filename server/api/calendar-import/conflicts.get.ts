import { requireActor } from '../../infrastructure/auth/actor'
import { listIcalConflicts } from '../../modules/calendar-import/ical.service'

export default defineEventHandler(async event => listIcalConflicts(await requireActor(event)))
