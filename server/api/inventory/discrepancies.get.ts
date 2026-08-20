import { listCleaningInventoryDiscrepancies } from '../../modules/inventory/inventory.service'
import { requireActor } from '../../infrastructure/auth/actor'

export default defineEventHandler(async event => listCleaningInventoryDiscrepancies(await requireActor(event)))
