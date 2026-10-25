export type ApartmentSearchable = { name: string, hotelName: string }

export function apartmentSearchText(apartment: ApartmentSearchable) {
  return `${apartment.name} ${apartment.hotelName}`
}

export function matchesApartmentSearch(apartment: ApartmentSearchable, query: string) {
  return apartmentSearchText(apartment).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}
