import { requireActor } from '../../infrastructure/auth/actor'
import { managerStatement } from '../../modules/finance/finance.service'
export default defineEventHandler(async event => managerStatement(await requireActor(event), String(getQuery(event).month ?? new Date().toISOString().slice(0, 7))))
