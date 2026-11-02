import type { PublicApartment } from './catalogue'

export type CatalogueLocation = {
  id: string
  name: string
  latitude: number
  longitude: number
  apartments: PublicApartment[]
}

export function catalogueLocations(apartments: PublicApartment[]): CatalogueLocation[] {
  const groups = new Map<string, CatalogueLocation>()
  for (const apartment of apartments) {
    const point = apartment.mapLocation
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) continue
    let group = groups.get(point.hotelId)
    if (!group) {
      group = { id: point.hotelId, name: point.hotelName, latitude: point.latitude, longitude: point.longitude, apartments: [] }
      groups.set(point.hotelId, group)
    }
    group.apartments.push(apartment)
  }
  return [...groups.values()]
}
