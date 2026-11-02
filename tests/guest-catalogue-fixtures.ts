import type { PublicApartment } from '../guest/shared/catalogue'
export function apartment(slug: string, hotelId = 'hotel-a'): PublicApartment {
  return { hotel: { id: hotelId, name: 'Hotel' }, slug, title: slug.toUpperCase(), summary: 'Балкон с видом на горы', description: '', location: '', capacity: 4, rooms: 2,
    checkInTime: '15:00', checkOutTime: '11:00', amenities: [],
    mapLocation: { hotelId, hotelName: 'Hotel', latitude: 41.84, longitude: 23.48 },
    photos: [{ id: 'one', url: '/one.jpg' }, { id: 'two', url: '/two.jpg' }, { id: 'three', url: '/three.jpg' }] }
}
