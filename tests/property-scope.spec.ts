import { describe, expect, it } from 'vitest'
import type { Apartment } from '../src/entities/apartment'
import { filterApartmentsByScope, isPropertyScopeReady, propertyScopeQuery } from '../src/features/select-property-scope/model/property-scope'

const apartments: Apartment[] = [
  { id: 'apartment-1', name: 'A1', building: '', locationDetails: '', status: 'active', hotel: { id: 'hotel-1', name: 'Hotel 1' }, managers: [] },
  { id: 'apartment-2', name: 'A2', building: '', locationDetails: '', status: 'active', hotel: { id: 'hotel-2', name: 'Hotel 2' }, managers: [] }
]

describe('property scope', () => {
  it('requires a concrete hotel or at least one apartment', () => {
    expect(isPropertyScopeReady({ scope: 'all', hotelId: 'all', apartmentIds: [] })).toBe(true)
    expect(isPropertyScopeReady({ scope: 'hotel', hotelId: 'all', apartmentIds: [] })).toBe(false)
    expect(isPropertyScopeReady({ scope: 'hotel', hotelId: 'hotel-1', apartmentIds: [] })).toBe(true)
    expect(isPropertyScopeReady({ scope: 'apartments', hotelId: 'all', apartmentIds: [] })).toBe(false)
  })

  it('filters apartments across hotels and builds the matching API query', () => {
    const value = { scope: 'apartments' as const, hotelId: 'all', apartmentIds: ['apartment-2'] }
    expect(filterApartmentsByScope(apartments, value).map(apartment => apartment.id)).toEqual(['apartment-2'])
    expect(propertyScopeQuery(value)).toEqual({ apartmentIds: ['apartment-2'] })
    expect(filterApartmentsByScope(apartments, { scope: 'hotel', hotelId: 'hotel-1', apartmentIds: [] }).map(apartment => apartment.id)).toEqual(['apartment-1'])
  })
})
