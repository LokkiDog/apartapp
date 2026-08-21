import { managerExpenseReportMonthSchema } from '@contracts/report'
import { requireActor } from '../../../../infrastructure/auth/actor'
import { unpublishManagerExpenseReport } from '../../../../modules/finance/finance.service'

export default defineEventHandler(async event => unpublishManagerExpenseReport(await requireActor(event), getRouterParam(event, 'apartmentId')!, managerExpenseReportMonthSchema.parse(await readBody(event)).month))
