import { requireActor } from '../../infrastructure/auth/actor'
import { listStays } from '../../modules/stay/stay.service'
export default defineEventHandler(async event => {
  const query = getQuery(event)
  return listStays(await requireActor(event), query.hotelId as string | undefined, query.from as string | undefined, query.to as string | undefined)
})
