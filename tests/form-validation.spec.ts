import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createFormValidator } from '../src/shared/lib/form-validation'
import {
  apartmentInputSchema,
  apartmentTypeInputSchema,
  cleaningInputSchema,
  consumableInputSchema,
  hotelInputSchema,
  specialServiceInputSchema,
  stayInputSchema,
  taskInputSchema,
  workProgressInputSchema
} from '../shared/contracts/crm'
import { expenseInputSchema } from '../shared/contracts/expense'

const messages = {
  ru: { required: 'Заполните поле', selection: 'Выберите значение', checkout: 'Выезд должен быть позже заезда', problem: 'Опишите проблему' },
  en: { required: 'Fill in this field', selection: 'Select a value', checkout: 'Check-out must be after check-in', problem: 'Describe the problem' },
  he: { required: 'יש למלא את השדה', selection: 'יש לבחור ערך', checkout: 'היציאה חייבת להיות אחרי הכניסה', problem: 'יש לתאר את הבעיה' }
} as const

function translator(locale: keyof typeof messages) {
  return (key: string, params?: Record<string, unknown>) => {
    const values: Record<string, string> = {
      'validation.required': messages[locale].required,
      'validation.selection': messages[locale].selection,
      'validation.checkoutAfterCheckin': messages[locale].checkout,
      'validation.problemDescriptionRequired': messages[locale].problem,
      'validation.invalid': `${locale}:invalid`,
      'validation.minNumber': `${locale}:min:${params?.value}`,
      'validation.maxNumber': `${locale}:max:${params?.value}`,
      'validation.minLength': `${locale}:min-length:${params?.count}`,
      'validation.maxLength': `${locale}:max-length:${params?.count}`,
      'validation.minItems': `${locale}:min-items:${params?.count}`,
      'validation.maxItems': `${locale}:max-items:${params?.count}`,
      'validation.email': `${locale}:email`,
      'validation.date': `${locale}:date`,
      'validation.format': `${locale}:format`,
      'validation.uniqueOwners': `${locale}:owners`,
      'validation.uniqueConsumables': `${locale}:consumables`
    }
    return values[key] ?? key
  }
}

describe('CRUD form validation', () => {
  it('returns every field and nested-array error in one pass', () => {
    const schema = z.object({
      name: z.string().trim().min(1),
      rows: z.array(z.object({ quantity: z.coerce.number().positive() }))
    })
    const errors = createFormValidator(schema, translator('ru'))({ name: '', rows: [{ quantity: 0 }, { quantity: -1 }] })
    expect(errors.map(error => error.name)).toEqual(['name', 'rows.0.quantity', 'rows.1.quantity'])
    expect(errors[0]?.message).toBe('Заполните поле')
  })

  it.each(['ru', 'en', 'he'] as const)('localizes required and cross-field errors in %s', (locale) => {
    const required = createFormValidator(z.object({ name: z.string().min(1) }), translator(locale))({ name: '' })
    expect(required[0]?.message).toBe(messages[locale].required)

    const stay = createFormValidator(stayInputSchema, translator(locale))({
      apartmentId: '00000000-0000-4000-8000-000000000001',
      checkInOn: '2026-08-20',
      checkOutOn: '2026-08-19',
      adultCount: 1,
      childCount: 0
    })
    expect(stay.find(error => error.name === 'checkOutOn')?.message).toBe(messages[locale].checkout)

    const progress = createFormValidator(workProgressInputSchema, translator(locale))({
      checklist: [],
      comment: '',
      hasProblem: true,
      problemDescription: ''
    })
    expect(progress.find(error => error.name === 'problemDescription')?.message).toBe(messages[locale].problem)
  })

  it('maps composite coordinate errors to one visible location field', () => {
    const errors = createFormValidator(hotelInputSchema, translator('en'), {
      pathMap: { latitude: 'location', longitude: 'location' },
      messages: { location: 'Choose a point on the map' },
      validate: (state) => {
        const value = state as { latitude: number | null, longitude: number | null }
        return value.latitude === null || value.longitude === null
          ? [{ name: 'location', message: 'Choose a point on the map' }]
          : []
      }
    })({ name: 'Hotel', address: 'Bansko', latitude: null, longitude: null })
    expect(errors).toEqual([{ name: 'location', message: 'Choose a point on the map' }])
  })

  it('rejects empty or invalid values in every covered CRUD contract', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(hotelInputSchema.safeParse({ name: '', address: '', latitude: null, longitude: null }).success).toBe(false)
    expect(apartmentInputSchema.safeParse({ hotelId: '', apartmentTypeId: '', name: '', capacity: 0, rooms: 0, checkInTime: '', checkOutTime: '' }).success).toBe(false)
    expect(stayInputSchema.safeParse({ apartmentId: '', checkInOn: '', checkOutOn: '', adultCount: 0, childCount: -1 }).success).toBe(false)
    expect(cleaningInputSchema.safeParse({ apartmentId: '', cleanerIds: [], scheduledOn: '', cleanerPoolEur: -1, laundryEur: 0, serviceEur: 0 }).success).toBe(false)
    expect(taskInputSchema.safeParse({ apartmentId: '', title: '', description: '', priority: 'wrong', ownerCostEur: -1 }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ apartmentId: '', occurredOn: '', amountEur: 0, description: '' }).success).toBe(false)
    expect(specialServiceInputSchema.safeParse({ name: '', priceEur: -1, managerSharePercent: 101, active: true }).success).toBe(false)
    expect(apartmentTypeInputSchema.safeParse({ name: '', cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0, defaultChecklist: [''], autoWriteOffs: [{ consumableId: id, quantity: 0 }] }).success).toBe(false)
    expect(consumableInputSchema.safeParse({ name: '', category: '', unit: '' }).success).toBe(false)
  })
})

describe('CRUD form registry', () => {
  const forms = [
    ['src/features/manage-apartment/ui/ApartmentForm.vue', ['name="hotelId"', 'name="apartmentTypeId"']],
    ['src/pages/hotels/HotelsPage.vue', ['id="hotel-form"', 'name="location"']],
    ['src/pages/calendar/CalendarPage.vue', ['id="stay-form"', 'name="checkInOn"']],
    ['src/features/manage-cleaning/ui/CleaningFormSlideover.vue', ['id="cleaning-form"', 'name="scheduledOn"']],
    ['src/pages/work/WorkPage.vue', ['id="task-form"', 'name="title"']],
    ['src/pages/expenses/ExpensesPage.vue', ['id="expense-form"', 'name="amountEur"']],
    ['src/pages/settings/ServicesSettingsPage.vue', ['id="service-form"', 'name="priceEur"']],
    ['src/pages/settings/ApartmentTypesSettingsPage.vue', ['id="apartment-type-form"', 'defaultChecklist.${index}']],
    ['src/pages/inventory/InventoryPage.vue', ['id="consumable-form"', 'name="category"']]
  ] as const

  it.each(forms)('%s uses managed Nuxt UI validation', (file, expectedFields) => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    expect(source).toContain('<UForm')
    expect(source).toContain('novalidate')
    expect(source).toContain('@error=')
    for (const field of expectedFields) expect(source).toContain(field)
  })
})
