import { requireActor } from '../../../../infrastructure/auth/actor'
import { reorderApartmentPhotos } from '../../../../modules/apartment/apartment-photos.service'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  return reorderApartmentPhotos(actor, getRouterParam(event, 'id')!, await readBody(event))
})
