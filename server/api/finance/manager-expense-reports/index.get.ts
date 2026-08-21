import { requireActor } from '../../../infrastructure/auth/actor'
import { listManagerExpenseReports } from '../../../modules/finance/finance.service'

export default defineEventHandler(async event => listManagerExpenseReports(await requireActor(event), String(getQuery(event).month ?? new Date().toISOString().slice(0, 7))))
