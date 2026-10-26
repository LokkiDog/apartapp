import { describe, expect, it } from 'vitest'
import { createApartmentFilters, matchesApartmentFilters } from '../src/pages/apartments/model/apartment-filters'

const apartments = [
  { id: 'shared', hotel: { id: 'north' }, type: { id: 'studio' }, status: 'active', managers: [{ id: 'another-owner' }, { id: 'me' }] },
  { id: 'foreign', hotel: { id: 'north' }, type: { id: 'studio' }, status: 'active', managers: [{ id: 'another-owner' }] },
  { id: 'archived', hotel: { id: 'south' }, type: { id: 'family' }, status: 'archived', managers: [{ id: 'me' }] },
  { id: 'unassigned', hotel: { id: 'north' }, type: { id: 'studio' }, status: 'inactive', managers: [] }
]
describe('apartment catalogue filters', () => {
  it('matches any of the owners and never treats an unassigned apartment as mine', () => {
    const filters = { ...createApartmentFilters(), onlyMine: true }
    expect(apartments.filter(apartment => matchesApartmentFilters(apartment, filters, 'me')).map(apartment => apartment.id)).toEqual(['shared', 'archived'])
    expect(apartments.filter(apartment => matchesApartmentFilters(apartment, filters))).toEqual([])
  })
  it('combines ownership, hotel, type and status and restores the full list on reset', () => {
    const filters = { onlyMine: true, hotelId: 'north', typeId: 'studio', status: 'active' }
    expect(apartments.filter(apartment => matchesApartmentFilters(apartment, filters, 'me')).map(apartment => apartment.id)).toEqual(['shared'])
    expect(matchesApartmentFilters(apartments[0]!, { ...filters, hotelId: 'south' }, 'me')).toBe(false)
    expect(matchesApartmentFilters(apartments[0]!, { ...filters, typeId: 'family' }, 'me')).toBe(false)
    expect(matchesApartmentFilters(apartments[0]!, { ...filters, status: 'archived' }, 'me')).toBe(false)
    expect(apartments.filter(apartment => matchesApartmentFilters(apartment, createApartmentFilters(), 'me')).map(apartment => apartment.id)).toEqual(['shared', 'foreign', 'archived', 'unassigned'])
  })
})
