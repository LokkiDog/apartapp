import { describe, expect, it } from 'vitest'
import { apartmentInputSchema, apartmentTypeInputSchema, apartmentUpdateSchema, cleaningAssignmentInputSchema, cleaningInputSchema, cleaningRouteUpdateSchema, cleaningTariffOverrideSchema, cleaningUpdateSchema, completionInputSchema, consumableInputSchema, hotelInputSchema, hotelReverseGeocodeQuerySchema, specialServiceInputSchema, stayInputSchema, stayListQuerySchema, taskInputSchema, workProgressInputSchema } from '../shared/contracts/crm'
import { formatEuroInput, parseEuroInput } from '../src/shared/lib/money'
import { apartmentCalendarColor } from '../src/shared/lib/calendar'
import { calculateFifoUsage } from '../server/modules/inventory/fifo'
import { resolveCompletionInventoryReports } from '../server/modules/inventory/cleaning-inventory'
import { inventoryThresholdSchema, managerExpenseReportSaveSchema, reportQuerySchema } from '../shared/contracts/report'
import { specialServiceIconOptions } from '../shared/config/special-service-icons'
import { compactStayServices } from '../src/pages/calendar/model/stay-service-icons'
import { buildStayServiceSnapshot } from '../server/modules/stay/stay-service-snapshot'
import { hasCleaningUrgency } from '../server/modules/cleaning/cleaning-urgency'

describe('CRM contracts', () => {
  it('accepts valid hotel coordinates and rejects invalid ones', () => {
    expect(hotelInputSchema.safeParse({ name: 'Hotel', address: 'Bansko', latitude: 41.84, longitude: 23.49 }).success).toBe(true)
    expect(hotelInputSchema.safeParse({ name: 'Hotel', address: 'Bansko', latitude: 91, longitude: 23.49 }).success).toBe(false)
    expect(hotelReverseGeocodeQuerySchema.safeParse({ latitude: '41.83', longitude: '23.49' }).success).toBe(true)
    expect(hotelReverseGeocodeQuerySchema.safeParse({ latitude: -91, longitude: 23.49 }).success).toBe(false)
    expect(hotelReverseGeocodeQuerySchema.safeParse({ latitude: 41.83, longitude: 181 }).success).toBe(false)
  })
  it('calculates a cleaning tariff total from its components', () => {
    const parsed = apartmentTypeInputSchema.parse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2 })
    expect(parsed.ownerTotalEur).toBe(10)
    expect(parsed.defaultChecklist).toEqual(['Сменить белье и полотенца', 'Проверить санузел и кухню', 'Проверить расходники'])
    expect(apartmentTypeInputSchema.safeParse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2, defaultChecklist: [''] }).success).toBe(false)
  })

  it('normalizes and validates an apartment building', () => {
    const base = {
      hotelId: '00000000-0000-4000-8000-000000000001',
      managerIds: ['00000000-0000-4000-8000-000000000002'],
      apartmentTypeId: '00000000-0000-4000-8000-000000000003',
      name: 'Mountain View 12',
      capacity: 4,
      rooms: 2,
      checkInTime: '15:00',
      checkOutTime: '11:00'
    }
    expect(apartmentInputSchema.parse(base).building).toBe('')
    expect(apartmentInputSchema.parse({ ...base, managerIds: [] }).managerIds).toEqual([])
    expect(apartmentInputSchema.safeParse({ ...base, managerIds: [base.managerIds[0], base.managerIds[0]] }).success).toBe(false)
    expect(apartmentInputSchema.safeParse({ ...base, managerIds: ['not-a-uuid'] }).success).toBe(false)
    expect(apartmentUpdateSchema.parse({ name: 'Новое имя' }).managerIds).toBeUndefined()
    expect(apartmentInputSchema.parse({ ...base, building: '  B  ' }).building).toBe('B')
    expect(apartmentInputSchema.safeParse({ ...base, building: 'B'.repeat(101) }).success).toBe(false)
  })
  it('requires check-out after check-in', () => {
    const base = { apartmentId: '00000000-0000-4000-8000-000000000001', adultCount: 1, childCount: 0 }
    expect(stayInputSchema.safeParse({ ...base, checkInOn: '2026-01-02', checkOutOn: '2026-01-03' }).success).toBe(true)
    expect(stayInputSchema.safeParse({ ...base, checkInOn: '2026-01-03', checkOutOn: '2026-01-02' }).success).toBe(false)
    expect(stayInputSchema.safeParse({ ...base, checkInOn: '2026-01-02T10:00:00Z', checkOutOn: '2026-01-03' }).success).toBe(false)
  })

  it('validates cash and selected service data on a stay', () => {
    const base = { apartmentId: '00000000-0000-4000-8000-000000000001', checkInOn: '2026-01-02', checkOutOn: '2026-01-03', adultCount: 1, childCount: 0 }
    expect(stayInputSchema.safeParse({ ...base, cashAmountEur: 25, serviceIds: [] }).success).toBe(true)
    expect(stayInputSchema.safeParse({ ...base, cashAmountEur: -1 }).success).toBe(false)
    expect(specialServiceInputSchema.safeParse({ name: 'Поздний выезд', priceEur: 20, managerSharePercent: 25, active: true }).success).toBe(true)
    expect(specialServiceInputSchema.safeParse({ name: 'Трансфер', priceEur: 20, managerSharePercent: 25, iconName: specialServiceIconOptions[1].name }).success).toBe(true)
    expect(specialServiceInputSchema.safeParse({ name: 'Трансфер', priceEur: 20, managerSharePercent: 25, iconName: 'i-lucide-not-a-real-icon' }).success).toBe(false)
    expect(specialServiceInputSchema.safeParse({ name: 'Поздний выезд', priceEur: 20, managerSharePercent: 101 }).success).toBe(false)
  })

  it('normalizes apartment filters for the stay list', () => {
    const firstId = '00000000-0000-4000-8000-000000000001'
    const secondId = '00000000-0000-4000-8000-000000000002'
    expect(stayListQuerySchema.parse({ apartmentIds: `${firstId},${secondId},${firstId}`, from: '2026-08-01', to: '2026-09-01' }).apartmentIds).toEqual([firstId, secondId])
    expect(stayListQuerySchema.safeParse({ apartmentIds: ['not-a-uuid'] }).success).toBe(false)
    expect(stayListQuerySchema.safeParse({ hotelId: firstId, apartmentIds: [secondId] }).success).toBe(false)
    expect(stayListQuerySchema.parse({ hotelId: firstId }).hotelId).toBe(firstId)
  })

  it('requires a reason for tariff override and a description for a problem', () => {
    const tariff = { cleanerPoolEur: 5, laundryEur: 4, serviceEur: 3 }
    expect(cleaningTariffOverrideSchema.safeParse({ ...tariff, reason: 'Праздничный тариф' }).success).toBe(true)
    expect(cleaningTariffOverrideSchema.safeParse({ ...tariff, reason: '' }).success).toBe(false)
    expect(completionInputSchema.safeParse({ checklist: [], hasProblem: true, problemDescription: '' }).success).toBe(false)
    expect(completionInputSchema.safeParse({ checklist: [], hasProblem: true, problemDescription: 'Протекает кран' }).success).toBe(true)
  })

  it('validates combined cleaning updates', () => {
    const tariff = { cleanerPoolEur: 5, laundryEur: 4, serviceEur: 3 }
    const cleanerId = '00000000-0000-4000-8000-000000000001'
    expect(cleaningUpdateSchema.safeParse({ ...tariff, cleanerIds: [], scheduledOn: null }).success).toBe(false)
    expect(cleaningUpdateSchema.safeParse({ ...tariff, cleanerIds: [cleanerId], scheduledOn: '2026-01-10' }).success).toBe(true)
    expect(cleaningUpdateSchema.safeParse({ ...tariff, cleanerIds: [cleanerId], scheduledOn: null }).success).toBe(false)
    expect(cleaningUpdateSchema.safeParse({ ...tariff, cleanerIds: [], scheduledOn: '2026-01-10T12:00:00Z' }).success).toBe(false)
  })

  it('validates optional cleaning inventory reports', () => {
    const consumableId = '00000000-0000-4000-8000-000000000001'
    expect(completionInputSchema.safeParse({ checklist: [], inventoryReports: [{ consumableId, usedQuantity: 0, remainingQuantity: 2 }] }).success).toBe(true)
    expect(completionInputSchema.safeParse({ checklist: [], inventoryReports: [{ consumableId, usedQuantity: -1, remainingQuantity: 2 }] }).success).toBe(false)
  })

  it('validates apartment-type auto write-off settings', () => {
    const base = { name: 'Туалетная бумага', category: 'Ванная', unit: 'шт.' }
    expect(consumableInputSchema.parse(base)).toEqual(base)
    expect(consumableInputSchema.parse({ ...base, autoWriteOffEnabled: true, autoWriteOffQuantity: 9 })).toEqual(base)
    expect(apartmentTypeInputSchema.parse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2 }).autoWriteOffs).toEqual([])
    const consumableId = '00000000-0000-4000-8000-000000000001'
    expect(apartmentTypeInputSchema.parse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2, autoWriteOffs: [{ consumableId, quantity: 1.5 }] }).autoWriteOffs).toEqual([{ consumableId, quantity: 1.5 }])
    expect(apartmentTypeInputSchema.safeParse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2, autoWriteOffs: [{ consumableId, quantity: 0 }] }).success).toBe(false)
    expect(apartmentTypeInputSchema.safeParse({ name: 'Studio', cleanerPoolEur: 5, laundryEur: 3, serviceEur: 2, autoWriteOffs: [{ consumableId, quantity: 1 }, { consumableId, quantity: 2 }] }).success).toBe(false)
  })

  it('prioritizes manual and draft inventory reports over automatic write-off', () => {
    const configured = [{ consumableId: 'guest', autoWriteOffQuantity: 2 }, { consumableId: 'cleaner', autoWriteOffQuantity: null }]
    expect(resolveCompletionInventoryReports({ configured, balances: [{ consumableId: 'guest', quantity: 7 }, { consumableId: 'cleaner', quantity: 4 }], savedReports: [] })).toEqual([{ consumableId: 'guest', usedQuantity: 2, remainingQuantity: 5 }])
    expect(resolveCompletionInventoryReports({ configured: [{ consumableId: 'guest', autoWriteOffQuantity: 5 }], balances: [{ consumableId: 'guest', quantity: 7 }], savedReports: [] })).toEqual([{ consumableId: 'guest', usedQuantity: 5, remainingQuantity: 2 }])
    expect(resolveCompletionInventoryReports({ configured, balances: [{ consumableId: 'guest', quantity: 7 }], savedReports: [{ consumableId: 'guest', usedQuantity: 1, remainingQuantity: 6 }] })).toEqual([{ consumableId: 'guest', usedQuantity: 1, remainingQuantity: 6 }])
    expect(resolveCompletionInventoryReports({ configured, balances: [{ consumableId: 'guest', quantity: 7 }], savedReports: [{ consumableId: 'guest', usedQuantity: 1, remainingQuantity: 6 }], submittedReports: [{ consumableId: 'guest', usedQuantity: 0, remainingQuantity: 7 }] })).toEqual([{ consumableId: 'guest', usedQuantity: 0, remainingQuantity: 7 }])
  })

  it('validates a saved work draft without requiring completion', () => {
    expect(workProgressInputSchema.safeParse({ checklist: [{ label: 'Проверить санузел', checked: false }], comment: '', hasProblem: false }).success).toBe(true)
    expect(workProgressInputSchema.safeParse({ checklist: [], hasProblem: true, problemDescription: '' }).success).toBe(false)
  })

  it('validates manual cleaning creation with optional stay and assignment', () => {
    const apartmentId = '00000000-0000-4000-8000-000000000001'
    const cleanerId = '00000000-0000-4000-8000-000000000002'
    const tariff = { cleanerPoolEur: 5, laundryEur: 4, serviceEur: 3 }
    expect(cleaningInputSchema.safeParse({ ...tariff, apartmentId, stayId: null, cleanerIds: [], scheduledOn: null }).success).toBe(false)
    expect(cleaningInputSchema.safeParse({ ...tariff, apartmentId, cleanerIds: [cleanerId], scheduledOn: null }).success).toBe(false)
    expect(cleaningInputSchema.safeParse({ ...tariff, apartmentId, cleanerIds: [cleanerId], scheduledOn: '2026-01-10' }).success).toBe(true)
    expect(cleaningInputSchema.safeParse({ ...tariff, apartmentId, cleanerIds: [], scheduledOn: '' }).success).toBe(false)
    expect(cleaningInputSchema.safeParse({ ...tariff, apartmentId, cleanerIds: [], scheduledOn: '2026-01-10T12:00:00Z' }).success).toBe(false)
    expect(cleaningInputSchema.parse({ ...tariff, apartmentId, cleanerIds: [], scheduledOn: '2026-01-10' }).checklist).toBeUndefined()
    expect(cleaningInputSchema.safeParse({ ...tariff, apartmentId, cleanerIds: [], scheduledOn: '2026-01-10', checklist: [{ label: 'Проверить окна', checked: false }] }).success).toBe(true)
    expect(cleaningInputSchema.parse({ ...tariff, apartmentId, cleanerIds: [], scheduledOn: '2026-01-10' }).urgencyOverride).toBeUndefined()
    expect(cleaningUpdateSchema.safeParse({ ...tariff, cleanerIds: [], scheduledOn: '2026-01-10', urgencyOverride: null }).success).toBe(true)
    expect(cleaningUpdateSchema.safeParse({ ...tariff, cleanerIds: [], scheduledOn: '2026-01-10', urgencyOverride: 'yes' }).success).toBe(false)
  })

  it('marks a cleaning urgent only when both departure and arrival exist', () => {
    expect(hasCleaningUrgency(true, true)).toBe(true)
    expect(hasCleaningUrgency(true, false)).toBe(false)
    expect(hasCleaningUrgency(false, true)).toBe(false)
  })

  it('validates a unique cleaning route order', () => {
    const base = { cleanerId: '00000000-0000-4000-8000-000000000001', scheduledOn: '2026-01-10' }
    expect(cleaningRouteUpdateSchema.safeParse({ ...base, cleaningIds: ['00000000-0000-4000-8000-000000000002'] }).success).toBe(true)
    expect(cleaningRouteUpdateSchema.safeParse({ ...base, cleaningIds: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'] }).success).toBe(false)
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

  it('compacts stay service icons and reports overflow', () => {
    const services = [{ id: 'one' }, { id: 'two' }, { id: 'three' }, { id: 'four' }]
    expect(compactStayServices(services, 3)).toEqual({ visible: services.slice(0, 3), hiddenCount: 1 })
    expect(compactStayServices(services.slice(0, 3), 3)).toEqual({ visible: services.slice(0, 3), hiddenCount: 0 })
    expect(compactStayServices([], 3)).toEqual({ visible: [], hiddenCount: 0 })
  })

  it('keeps the selected service icon in the stay snapshot', () => {
    const snapshot = buildStayServiceSnapshot('stay-1', { id: 'service-1', name: 'Трансфер', iconName: 'i-lucide-car', priceEur: 20, managerSharePercent: 10 })
    expect(snapshot.iconNameSnapshot).toBe('i-lucide-car')
    expect(snapshot.specialServiceId).toBe('service-1')
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

  it('validates manager expense report lines with optional dates and signed amounts', () => {
    const valid = { month: '2026-08', categoryVisibility: { cleaning: true, inventory: false, task: true, other: true }, lines: [
      { category: 'cleaning', description: 'Уборка после выезда', occurredOn: '2026-08-12', amountEur: 18.555 },
      { category: 'inventory', description: 'Расходники', occurredOn: null, amountEur: -3.5 },
      { category: 'task', description: 'Замена замка', amountEur: 0 }
    ] }
    expect(managerExpenseReportSaveSchema.parse(valid).lines[0].amountEur).toBe(18.56)
    expect(managerExpenseReportSaveSchema.safeParse({ ...valid, month: '2026-13' }).success).toBe(false)
    expect(managerExpenseReportSaveSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], occurredOn: '2026-09-01' }] }).success).toBe(false)
    expect(managerExpenseReportSaveSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], category: 'guest_service' }] }).success).toBe(false)
    expect(managerExpenseReportSaveSchema.safeParse({ ...valid, categoryVisibility: { cleaning: true, inventory: false, task: true } }).success).toBe(false)
    expect(managerExpenseReportSaveSchema.safeParse({ ...valid, categoryVisibility: { ...valid.categoryVisibility, task: 'yes' } }).success).toBe(false)
  })
})
