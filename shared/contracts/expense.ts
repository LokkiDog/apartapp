import Decimal from 'decimal.js'
import { z } from 'zod'

const expenseAmountSchema = z.coerce.number().finite('Укажите сумму').positive('Сумма должна быть больше нуля').max(9_999_999_999.99)
  .transform(value => Number(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))

export const expenseInputSchema = z.object({
  apartmentId: z.uuid({ error: 'Выберите апартамент' }),
  occurredOn: z.iso.date(),
  amountEur: expenseAmountSchema,
  description: z.string().trim().min(1, 'Введите описание').max(200, 'Описание не должно превышать 200 символов')
})

export const expenseListQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  apartmentId: z.uuid({ error: 'Некорректный апартамент' }).optional()
}).strict().superRefine((value, context) => {
  if (value.to < value.from) context.addIssue({ code: 'custom', path: ['to'], message: 'Дата окончания должна быть не раньше даты начала' })
  const days = Math.floor((Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000) + 1
  if (days > 366) context.addIssue({ code: 'custom', path: ['to'], message: 'Максимальный период — 366 дней' })
})

export type ExpenseInput = z.infer<typeof expenseInputSchema>
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>
