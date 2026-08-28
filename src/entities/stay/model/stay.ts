export interface Stay {
  id: string
  checkInOn: string
  checkOutOn: string
  adultCount: number
  childCount: number
  specialRequests?: string
  guestName?: string
  guestPhone?: string
  guestComment?: string
  cashAmountEur?: number | null
  apartmentId: string
  apartment: { name: string; hotel: { name: string } }
  cleaning?: { id: string; status: string; scheduledOn: string } | null
  services?: Array<{
    id: string
    specialServiceId: string
    nameSnapshot: string
    iconNameSnapshot: string
    priceEurSnapshot: number
    managerSharePercentSnapshot: number
  }>
}
