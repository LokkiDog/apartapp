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
}

export function createApartmentFormState(initial: Partial<ApartmentFormState> = {}): ApartmentFormState {
  return {
    hotelId: '',
    managerId: '',
    apartmentTypeId: '',
    name: '',
    internalCode: '',
    building: '',
    locationDetails: '',
    capacity: 2,
    rooms: 1,
    checkInTime: '15:00',
    checkOutTime: '11:00',
    instructions: '',
    status: 'active',
    ...initial
  }
}
