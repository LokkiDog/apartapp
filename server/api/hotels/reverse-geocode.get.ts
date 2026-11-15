import { hotelReverseGeocodeQuerySchema } from '@contracts/crm'
import { geoapifyLocations } from '../../infrastructure/geocoding/geoapify'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const query = hotelReverseGeocodeQuerySchema.parse(getQuery(event))
  const config = useRuntimeConfig(event)
  if (config.geoapifyApiKey.trim()) {
    const [result] = await geoapifyLocations('reverse', { lat: query.latitude, lon: query.longitude }, config, actor.locale)
    if (!result) throw createError({ statusCode: 502, statusMessage: 'Не удалось определить адрес по выбранной точке' })
    return { address: result.address, attribution: result.attribution }
  }

  try {
    const response = await $fetch<{ display_name?: string }>('https://nominatim.openstreetmap.org/reverse', {
      query: { format: 'jsonv2', lat: query.latitude, lon: query.longitude, 'accept-language': 'ru' },
      headers: {
        accept: 'application/json',
        'user-agent': `Aparts CRM/${config.public.appUrl}`
      }
    })
    const address = response.display_name?.trim()
    if (!address) throw new Error('Nominatim returned an empty address')
    return { address }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Не удалось определить адрес по выбранной точке' })
  }
})
