export interface ApartmentFilters {
  onlyMine: boolean
  hotelId: string
  typeId: string
  status: string
}

export function createApartmentFilters(): ApartmentFilters {
  return { onlyMine: false, hotelId: 'all', typeId: 'all', status: 'all' }
}

export function matchesApartmentFilters(
  apartment: { hotel: { id: string }, type: { id: string }, status: string, managers: Array<{ id: string }> },
  filters: ApartmentFilters,
  currentUserId?: string
): boolean {
  return (!filters.onlyMine || Boolean(currentUserId && apartment.managers.some(manager => manager.id === currentUserId)))
    && (filters.hotelId === 'all' || apartment.hotel.id === filters.hotelId)
    && (filters.typeId === 'all' || apartment.type.id === filters.typeId)
    && (filters.status === 'all' || apartment.status === filters.status)
}
