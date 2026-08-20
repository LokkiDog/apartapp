import { describe, expect, it } from 'vitest'
import { canChangeTaskApartment, cleaningTariffHasChanged, restoredInventoryLot } from '../server/modules/work/work-policy'

describe('work server policies', () => {
  it('allows changing a task apartment only before work and inventory usage', () => {
    expect(canChangeTaskApartment('open', false)).toBe(true)
    expect(canChangeTaskApartment('open', true)).toBe(false)
    expect(canChangeTaskApartment('in_progress', false)).toBe(false)
    expect(canChangeTaskApartment('completed', false)).toBe(false)
  })

  it('requires a tariff reason only when tariff values change', () => {
    const tariff = { ownerTotalEur: 12, cleanerPoolEur: 5, laundryEur: 4, serviceEur: 3 }
    expect(cleaningTariffHasChanged(tariff, { ...tariff })).toBe(false)
    expect(cleaningTariffHasChanged(tariff, { ...tariff, serviceEur: 4, ownerTotalEur: 13 })).toBe(true)
  })

  it('restores deleted work usage with its original quantity and unit cost', () => {
    expect(restoredInventoryLot({ apartmentId: 'apartment', consumableId: 'soap', quantity: '1.500', totalCostEur: 3.5 })).toEqual({
      apartmentId: 'apartment',
      consumableId: 'soap',
      remainingQuantity: '1.500',
      unitCostEur: 2.33
    })
  })
})
