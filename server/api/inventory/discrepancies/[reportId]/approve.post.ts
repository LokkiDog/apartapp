import { requireActor } from '../../../../infrastructure/auth/actor'
import { approveCleaningInventoryDiscrepancy } from '../../../../modules/inventory/inventory.service'

export default defineEventHandler(async event => approveCleaningInventoryDiscrepancy(
  await requireActor(event),
  getRouterParam(event, 'reportId')!
))
