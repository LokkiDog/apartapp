import { dashboardQuerySchema } from '@contracts/dashboard'
import { requireActor } from '../../infrastructure/auth/actor'
import { dashboardSummary } from '../../modules/dashboard/dashboard.service'

export default defineEventHandler(async event => {
  const { month } = dashboardQuerySchema.parse(getQuery(event))
  return dashboardSummary(await requireActor(event), month)
})
