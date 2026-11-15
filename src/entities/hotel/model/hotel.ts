export interface Hotel {
  id: string
  name: string
  address: string
  addressAttribution?: string | null
  latitude: string
  longitude: string
  status: 'active' | 'archived'
  createdAt: string
}

export interface HotelCoordinates {
  latitude: number
  longitude: number
}

export interface HotelMapViewport extends HotelCoordinates {
  zoom: number
}
