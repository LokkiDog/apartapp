import Decimal from 'decimal.js'
import { z } from 'zod'

const amountSchema = z.coerce.number().finite('Укажите сумму').positive('Сумма должна быть больше нуля').max(9_999_999_999.99)
  .transform(value => Number(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))

export const problemInputSchema = z.object({
  apartmentId: z.uuid({ error: 'Выберите апартамент' }),
  description: z.string().trim().min(1, 'Опишите проблему').max(2000)
})
export const problemUpdateSchema = problemInputSchema.pick({ description: true })
export const problemResolveSchema = z.object({ resolutionComment: z.string().trim().max(2000).default('') })
export const problemListQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  apartmentId: z.uuid({ error: 'Некорректный апартамент' }).optional()
}).strict()
export const problemExpenseSchema = z.object({
  occurredOn: z.iso.date(),
  amountEur: amountSchema,
  description: z.string().trim().min(1, 'Введите описание').max(200)
})
export type ProblemInput = z.infer<typeof problemInputSchema>
export type ProblemListQuery = z.infer<typeof problemListQuerySchema>
export type ProblemExpenseInput = z.infer<typeof problemExpenseSchema>
