import { managerExpenseReportMonthSchema } from '@contracts/report'
import { requireActor } from '../../../../infrastructure/auth/actor'
import { publishManagerExpenseReport } from '../../../../modules/finance/finance.service'

export default defineEventHandler(async event => publishManagerExpenseReport(await requireActor(event), getRouterParam(event, 'apartmentId')!, managerExpenseReportMonthSchema.parse(await readBody(event)).month))
