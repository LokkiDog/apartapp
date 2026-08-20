import { stayListQuerySchema } from '@contracts/crm'
import { requireActor } from '../../infrastructure/auth/actor'
import { listStays } from '../../modules/stay/stay.service'
export default defineEventHandler(async event => {
  const query = stayListQuerySchema.parse(getQuery(event))
  return listStays(await requireActor(event), query)
})
