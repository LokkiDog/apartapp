import { hotelLocationSearchSchema } from '@contracts/hotel-location-search'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { geoapifyLocations } from '../../infrastructure/geocoding/geoapify'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const input = hotelLocationSearchSchema.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Invalid address query' })
  return { results: await geoapifyLocations('search', { text: input.data.text }, useRuntimeConfig(event), actor.locale) }
})
