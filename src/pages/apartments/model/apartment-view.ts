export const apartmentViewStorageKey = 'aparts.apartments.view'
export const apartmentSortStorageKey = 'aparts.apartments.sort'

export const apartmentViews = ['compact', 'standard', 'list'] as const
export const apartmentSorts = ['name', 'createdAt', 'hotel'] as const

export type ApartmentView = typeof apartmentViews[number]
export type ApartmentSort = typeof apartmentSorts[number]

export function parseApartmentView(value: string | null): ApartmentView {
  return apartmentViews.includes(value as ApartmentView) ? value as ApartmentView : 'standard'
}

export function parseApartmentSort(value: string | null): ApartmentSort {
  return apartmentSorts.includes(value as ApartmentSort) ? value as ApartmentSort : 'name'
}
