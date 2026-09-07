import type { ApartmentInput } from '@contracts/crm'

export type ApartmentFormMode = 'create' | 'edit'

export type ApartmentFormState = ApartmentInput

export type ApartmentFormHotel = {
  id: string
  name: string
  status: 'active' | 'archived'
}

export type ApartmentFormManager = {
  id: string
  name: string
  roles: string[]
  status: string
}

export type ApartmentFormType = {
  id: string
  name: string
  defaultChecklist: string[]
}

export function createApartmentFormState(initial: Partial<ApartmentFormState> = {}): ApartmentFormState {
  return {
    hotelId: '',
    managerIds: [],
    apartmentTypeId: '',
    name: '',
    building: '',
    locationDetails: '',
    capacity: 4,
    rooms: 2,
    checkInTime: '15:00',
    checkOutTime: '11:00',
    instructions: '',
    automaticLinenCollection: false,
    additionalChecklist: [],
    status: 'active',
    ...initial
  }
}
