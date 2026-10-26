export type PublicApartment = {
  slug: string; title: string; summary: string; description: string; location: string
  capacity: number; rooms: number; checkInTime: string; checkOutTime: string
  amenities: string[]; photos: Array<{ id: string; url: string }>
}
