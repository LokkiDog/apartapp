export interface Apartment {
  id: string
  name: string
  building: string
  locationDetails: string
  additionalChecklist: string[]
  automaticLinenCollection: boolean
  status: string
  hotel: { id: string; name: string }
  tariffOverride?: { ownerTotalEur: number; cleanerPoolEur: number; laundryEur: number; serviceEur: number } | null
  type?: { ownerTotalEur: number; cleanerPoolEur: number; laundryEur: number; serviceEur: number; defaultChecklist?: string[] } | null
  managers: Array<{ id: string; name: string }>
}
