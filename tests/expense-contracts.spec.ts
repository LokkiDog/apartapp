import { describe, expect, it } from 'vitest'
import { expenseInputSchema, expenseListQuerySchema } from '../shared/contracts/expense'

const apartmentId = '00000000-0000-4000-8000-000000000001'

describe('expense contracts', () => {
  it('validates and rounds a manual expense', () => {
    const expense = expenseInputSchema.parse({ apartmentId, occurredOn: '2026-08-12', amountEur: 18.555, description: ' Замена смесителя ' })
    expect(expense).toEqual({ apartmentId, occurredOn: '2026-08-12', amountEur: 18.56, description: 'Замена смесителя' })
  })

  it('rejects invalid expense fields', () => {
    expect(expenseInputSchema.safeParse({ apartmentId: 'wrong', occurredOn: '2026-08-12', amountEur: 10, description: 'Расход' }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ apartmentId, occurredOn: '2026-08-12', amountEur: 0, description: 'Расход' }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ apartmentId, occurredOn: '2026-08-12', amountEur: 10, description: '' }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ apartmentId, occurredOn: '2026-08-12', amountEur: 10, description: 'x'.repeat(201) }).success).toBe(false)
  })

  it('limits the expense list period to 366 days', () => {
    expect(expenseListQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-01' }).success).toBe(true)
    expect(expenseListQuerySchema.safeParse({ from: '2026-01-02', to: '2027-01-03' }).success).toBe(false)
    expect(expenseListQuerySchema.safeParse({ from: '2026-08-31', to: '2026-08-01' }).success).toBe(false)
  })
})
