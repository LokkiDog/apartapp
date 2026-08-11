export interface Apartment {
  id: string
  name: string
  internalCode: string
  building: string
  locationDetails: string
  status: string
  hotel: { id: string; name: string }
  manager: { id: string; name: string } | null
}
