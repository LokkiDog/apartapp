import type { Hotel, HotelMapViewport } from './hotel'

export const worldHotelViewport: HotelMapViewport = { latitude: 20, longitude: 0, zoom: 2 }
export const hotelNeighborhoodZoom = 14

export function latestHotelViewport(hotels: readonly Hotel[]): HotelMapViewport {
  let latest: HotelMapViewport = worldHotelViewport
  let latestCreatedAt = -Infinity

  for (const hotel of hotels) {
    if (hotel.status !== 'active' || !hotel.latitude?.trim() || !hotel.longitude?.trim()) continue
    const createdAt = Date.parse(hotel.createdAt)
    if (!Number.isFinite(createdAt) || createdAt <= latestCreatedAt) continue
    const latitude = Number(hotel.latitude)
    const longitude = Number(hotel.longitude)
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
      || !Number.isFinite(longitude) || Math.abs(longitude) > 180) continue

    latest = { latitude, longitude, zoom: hotelNeighborhoodZoom }
    latestCreatedAt = createdAt
  }
  return latest
}
