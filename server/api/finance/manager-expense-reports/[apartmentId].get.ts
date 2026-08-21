import { requireActor } from '../../../infrastructure/auth/actor'
import { getManagerExpenseReport } from '../../../modules/finance/finance.service'

export default defineEventHandler(async event => getManagerExpenseReport(await requireActor(event), getRouterParam(event, 'apartmentId')!, String(getQuery(event).month ?? new Date().toISOString().slice(0, 7))))
