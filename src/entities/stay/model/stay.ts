export interface Stay {
  id: string
  checkInOn: string
  checkOutOn: string
  adultCount: number
  childCount: number
  sleepingPlacesUsed?: number
  specialRequests?: string
  guestName?: string
  guestPhone?: string
  guestComment?: string
  cashAmountEur?: number | null
  apartmentId: string
  apartment: { name: string; hotel: { name: string } }
  services?: Array<{ nameSnapshot: string; priceEurSnapshot: number }>
}
