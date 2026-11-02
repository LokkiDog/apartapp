import type { PublicMapLocation } from '../../../shared/contracts/publication'

export function publicMapLocation(hotel: {
  hotelId: string | null
  hotelName: string | null
  latitude: string | number | null
  longitude: string | number | null
}): PublicMapLocation | null {
  if (!hotel.hotelId || !hotel.hotelName || hotel.latitude === null || hotel.longitude === null) return null
  const latitude = Number(hotel.latitude)
  const longitude = Number(hotel.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { hotelId: hotel.hotelId, hotelName: hotel.hotelName, latitude, longitude }
}
