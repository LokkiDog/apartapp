import { reportQuerySchema } from '@contracts/report'
import { requireActor } from '../../infrastructure/auth/actor'
import { globalReport } from '../../modules/report/report.service'

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = reportQuerySchema.parse(getQuery(event))
  return globalReport(await requireActor(event), query)
})
