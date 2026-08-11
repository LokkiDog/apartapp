import { describe, expect, it } from 'vitest'
import { apartmentInputSchema, apartmentTypeInputSchema, cleaningAssignmentInputSchema, cleaningTariffOverrideSchema, completionInputSchema, hotelInputSchema, specialServiceInputSchema, stayInputSchema, taskInputSchema } from '../shared/contracts/crm'
import { formatEuroInput, parseEuroInput } from '../src/shared/lib/money'
import { apartmentCalendarColor } from '../src/shared/lib/calendar'
import { calculateFifoUsage } from '../server/modules/inventory/fifo'
import { inventoryThresholdSchema, reportQuerySchema } from '../shared/contracts/report'

describe('CRM contracts', () => {
  it('accepts valid hotel coordinates and rejects invalid ones', () => {
    expect(hotelInputSchema.safeParse({ name: 'Hotel', address: 'Bansko', latitude: 41.84, longitude: 23.49 }).success).toBe(true)
    expect(hotelInputSchema.safeParse({ name: 'Hotel', address: 'Bansko', latitude: 91, longitude: 23.49 }).success).toBe(false)
  })
  it('calculates a cleaning tariff total from its components', () => {
    const parsed = apartmentTypeInputSchema.parse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2 })
    expect(parsed.ownerTotalEur).toBe(10)
  })

  it('normalizes and validates an apartment building', () => {
    const base = {
      hotelId: '00000000-0000-4000-8000-000000000001',
      managerId: '00000000-0000-4000-8000-000000000002',
      apartmentTypeId: '00000000-0000-4000-8000-000000000003',
      name: 'Mountain View 12',
      internalCode: 'MV-12',
      capacity: 4,
      rooms: 2,
      sleepingPlaces: 3,
      checkInTime: '15:00',
      checkOutTime: '11:00'
    }
    expect(apartmentInputSchema.parse(base).building).toBe('')
    expect(apartmentInputSchema.parse({ ...base, building: '  B  ' }).building).toBe('B')
    expect(apartmentInputSchema.safeParse({ ...base, building: 'B'.repeat(101) }).success).toBe(false)
  })
  it('requires check-out after check-in', () => {
    const base = { apartmentId: '00000000-0000-4000-8000-000000000001', adultCount: 1, childCount: 0, sleepingPlacesUsed: 1 }
    expect(stayInputSchema.safeParse({ ...base, checkInOn: '2026-01-02', checkOutOn: '2026-01-03' }).success).toBe(true)
    expect(stayInputSchema.safeParse({ ...base, checkInOn: '2026-01-03', checkOutOn: '2026-01-02' }).success).toBe(false)
    expect(stayInputSchema.safeParse({ ...base, checkInOn: '2026-01-02T10:00:00Z', checkOutOn: '2026-01-03' }).success).toBe(false)
  })

  it('validates cash and selected service data on a stay', () => {
    const base = { apartmentId: '00000000-0000-4000-8000-000000000001', checkInOn: '2026-01-02', checkOutOn: '2026-01-03', adultCount: 1, childCount: 0, sleepingPlacesUsed: 1 }
    expect(stayInputSchema.safeParse({ ...base, cashAmountEur: 25, serviceIds: [] }).success).toBe(true)
    expect(stayInputSchema.safeParse({ ...base, cashAmountEur: -1 }).success).toBe(false)
    expect(specialServiceInputSchema.safeParse({ name: 'Поздний выезд', priceEur: 20, managerSharePercent: 25, active: true }).success).toBe(true)
    expect(specialServiceInputSchema.safeParse({ name: 'Поздний выезд', priceEur: 20, managerSharePercent: 101 }).success).toBe(false)
  })

  it('requires a reason for tariff override and a description for a problem', () => {
    const tariff = { cleanerPoolEur: 5, laundryEur: 4, serviceEur: 3 }
    expect(cleaningTariffOverrideSchema.safeParse({ ...tariff, reason: 'Праздничный тариф' }).success).toBe(true)
    expect(cleaningTariffOverrideSchema.safeParse({ ...tariff, reason: '' }).success).toBe(false)
    expect(completionInputSchema.safeParse({ checklist: [], hasProblem: true, problemDescription: '' }).success).toBe(false)
    expect(completionInputSchema.safeParse({ checklist: [], hasProblem: true, problemDescription: 'Протекает кран' }).success).toBe(true)
  })

  it('accepts comma and dot EUR input and rounds to the nearest cent', () => {
    expect(parseEuroInput('2')).toBe(2)
    expect(parseEuroInput('10,5')).toBe(10.5)
    expect(parseEuroInput('10.5')).toBe(10.5)
    expect(parseEuroInput('10,555')).toBe(10.56)
    expect(parseEuroInput('9999999999,99')).toBe(9_999_999_999.99)
    expect(parseEuroInput('10000000000')).toBeNull()
    expect(parseEuroInput('-1')).toBeNull()
    expect(parseEuroInput('abc')).toBeNull()
    expect(formatEuroInput(10.5)).toBe('10,5')
    expect(formatEuroInput(2)).toBe('2')
  })

  it('accepts the maximum database amount and rejects overflow', () => {
    expect(specialServiceInputSchema.safeParse({ name: 'Максимальная услуга', priceEur: 9_999_999_999.99, managerSharePercent: 0 }).success).toBe(true)
    expect(specialServiceInputSchema.safeParse({ name: 'Слишком большая услуга', priceEur: 10_000_000_000, managerSharePercent: 0 }).success).toBe(false)
  })

  it('calculates FIFO across lots and rounds every allocation to cents', () => {
    const result = calculateFifoUsage([
      { id: 'old', remainingQuantity: '1.500', unitCostEur: 2.33 },
      { id: 'new', remainingQuantity: '2.000', unitCostEur: 4.01 }
    ], 2)
    expect(result.allocations).toEqual([
      { lotId: 'old', quantity: '1.500', remainingQuantity: '0.000', costEur: 3.5 },
      { lotId: 'new', quantity: '0.500', remainingQuantity: '1.500', costEur: 2.01 }
    ])
    expect(result.totalCostEur).toBe(5.51)
    expect(() => calculateFifoUsage([{ id: 'only', remainingQuantity: 1, unitCostEur: 1 }], 2)).toThrow('INSUFFICIENT_STOCK')
  })

  it('accepts only date-only operational planning fields', () => {
    expect(cleaningAssignmentInputSchema.safeParse({ cleanerIds: ['00000000-0000-4000-8000-000000000001'], scheduledOn: '2026-01-10' }).success).toBe(true)
    expect(cleaningAssignmentInputSchema.safeParse({ cleanerIds: ['00000000-0000-4000-8000-000000000001'], scheduledOn: '2026-01-10T12:00:00Z' }).success).toBe(false)
    expect(taskInputSchema.safeParse({ apartmentId: '00000000-0000-4000-8000-000000000001', title: 'Проверить замок', dueOn: '2026-01-10' }).success).toBe(true)
  })

  it('uses a stable calendar color for each apartment', () => {
    expect(apartmentCalendarColor('apartment-1')).toEqual(apartmentCalendarColor('apartment-1'))
    expect(apartmentCalendarColor('apartment-1').background).toMatch(/^#/)
  })

  it('validates report periods and stock targets', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31', scope: 'all' }).success).toBe(true)
    expect(reportQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31', scope: 'hotel', hotelId: '00000000-0000-4000-8000-000000000001' }).success).toBe(true)
    expect(reportQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31', scope: 'apartments', apartmentIds: '00000000-0000-4000-8000-000000000001' }).data?.apartmentIds).toEqual(['00000000-0000-4000-8000-000000000001'])
    expect(reportQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31', scope: 'apartments', apartmentIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'] }).data?.apartmentIds).toHaveLength(1)
    expect(reportQuerySchema.safeParse({ from: '2026-08-31', to: '2026-08-01', scope: 'all' }).success).toBe(false)
    expect(reportQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02', scope: 'all' }).success).toBe(false)
    expect(reportQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31', scope: 'apartments', apartmentIds: [] }).success).toBe(false)
    expect(reportQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31', scope: 'hotel', hotelId: '00000000-0000-4000-8000-000000000001', apartmentIds: ['00000000-0000-4000-8000-000000000002'] }).success).toBe(false)
    const consumableId = '00000000-0000-4000-8000-000000000001'
    expect(inventoryThresholdSchema.safeParse({ consumableId, minimumQuantity: 5, targetQuantity: 10 }).success).toBe(true)
    expect(inventoryThresholdSchema.safeParse({ consumableId, minimumQuantity: 5.5, targetQuantity: 10 }).success).toBe(false)
    expect(inventoryThresholdSchema.safeParse({ consumableId, minimumQuantity: 5, targetQuantity: 5 }).success).toBe(false)
  })
})
