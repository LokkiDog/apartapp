import { requireActor } from '../../../infrastructure/auth/actor'
import { syncApartmentIcal } from '../../../modules/calendar-import/ical.service'

export default defineEventHandler(async event => syncApartmentIcal(await requireActor(event), getRouterParam(event, 'apartmentId')!))
