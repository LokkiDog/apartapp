import { describe, expect, it } from 'vitest'
import { catalogueLocations } from '../guest/shared/catalogue-map'
import { publicMapLocation } from '../server/modules/publication/publication-map'
import { apartment } from './guest-catalogue-fixtures'


describe('catalogue building locations', () => {
  it('converts stored numeric coordinates and omits unavailable or invalid points', () => {
    const hotel = { hotelId: 'hotel-a', hotelName: 'Pirin', latitude: '41.840000', longitude: '23.480000' }
    expect(publicMapLocation(hotel)).toEqual({ hotelId: 'hotel-a', hotelName: 'Pirin', latitude: 41.84, longitude: 23.48 })
    for (const point of [{ ...hotel, hotelId: null }, { ...hotel, latitude: null }, { ...hotel, latitude: 'NaN' }, { ...hotel, latitude: '91' }, { ...hotel, longitude: '-181' }]) {
      expect(publicMapLocation(point)).toBeNull()
    }
    expect(publicMapLocation({ ...hotel, latitude: '0', longitude: '0' })?.latitude).toBe(0)
  })
  it('groups by the actual building, keeps publication order and excludes invalid points without removing listings', () => {
    const items = [apartment('a104'), apartment('b203'), apartment('c305', 'hotel-b'), { ...apartment('no-point'), mapLocation: null },
      { ...apartment('bad-point'), mapLocation: { ...apartment('bad-point').mapLocation!, latitude: Infinity } }]
    const groups = catalogueLocations(items)
    expect(groups.map(group => [group.id, group.apartments.map(item => item.slug)])).toEqual([
      ['hotel-a', ['a104', 'b203']], ['hotel-b', ['c305']]
    ])
    expect(items).toHaveLength(5)
  })
})
