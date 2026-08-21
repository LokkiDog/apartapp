import { requireActor } from '../../../infrastructure/auth/actor'
import { saveManagerExpenseReport } from '../../../modules/finance/finance.service'

export default defineEventHandler(async event => saveManagerExpenseReport(await requireActor(event), getRouterParam(event, 'apartmentId')!, await readBody(event)))
