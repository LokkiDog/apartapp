import type { Apartment } from '#fsd/entities/apartment'

export type PropertyScope = 'all' | 'hotel' | 'apartments'

export interface PropertyScopeValue {
  scope: PropertyScope
  hotelId: string
  apartmentIds: string[]
}

export function isPropertyScopeReady(value: PropertyScopeValue) {
  return value.scope === 'all'
    || (value.scope === 'hotel' && value.hotelId !== 'all')
    || (value.scope === 'apartments' && value.apartmentIds.length > 0)
}

export function filterApartmentsByScope(apartments: Apartment[], value: PropertyScopeValue) {
  if (value.scope === 'hotel') return apartments.filter(apartment => apartment.hotel.id === value.hotelId)
  if (value.scope === 'apartments') {
    const selectedIds = new Set(value.apartmentIds)
    return apartments.filter(apartment => selectedIds.has(apartment.id))
  }
  return apartments
}

export function propertyScopeQuery(value: PropertyScopeValue) {
  if (value.scope === 'hotel') return { hotelId: value.hotelId }
  if (value.scope === 'apartments') return { apartmentIds: value.apartmentIds }
  return {}
}
