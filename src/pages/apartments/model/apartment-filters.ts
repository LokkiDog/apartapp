import { z } from 'zod'

export const apartmentFiltersSchema = z.object({
  onlyMine: z.boolean().default(false),
  hotelId: z.string().default('all'),
  typeId: z.string().default('all'),
  status: z.enum(['all', 'active', 'inactive', 'archived']).default('all'),
  publication: z.enum(['all', 'published', 'unpublished']).default('all'),
})
export type ApartmentFilters = z.infer<typeof apartmentFiltersSchema>

export function createApartmentFilters(): ApartmentFilters {
  return apartmentFiltersSchema.parse({})
}

export function matchesApartmentFilters(
  apartment: { hotel: { id: string }, type: { id: string }, status: string, isPublished?: boolean, managers: Array<{ id: string }> },
  filters: ApartmentFilters,
  currentUserId?: string
): boolean {
  return (!filters.onlyMine || Boolean(currentUserId && apartment.managers.some(manager => manager.id === currentUserId)))
    && (filters.hotelId === 'all' || apartment.hotel.id === filters.hotelId)
    && (filters.typeId === 'all' || apartment.type.id === filters.typeId)
    && (filters.status === 'all' || apartment.status === filters.status)
    && (filters.publication === 'all' || Boolean(apartment.isPublished) === (filters.publication === 'published'))
}
