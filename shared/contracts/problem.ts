import Decimal from 'decimal.js'
import { z } from 'zod'

const amountSchema = z.coerce.number().finite('Укажите сумму').positive('Сумма должна быть больше нуля').max(9_999_999_999.99)
  .transform(value => Number(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))
const taskCostSchema = z.coerce.number().finite('Укажите сумму').nonnegative('Сумма не может быть отрицательной').max(9_999_999_999.99)
  .transform(value => Number(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))

export const problemInputSchema = z.object({
  apartmentId: z.uuid({ error: 'Выберите апартамент' }),
  description: z.string().trim().min(1, 'Укажите проблему').max(2000),
  details: z.string().trim().max(2000).optional().default('')
})
export const problemUpdateSchema = problemInputSchema.pick({ description: true }).extend({
  details: z.string().trim().max(2000).optional()
})
export const problemResolveSchema = z.object({ resolutionComment: z.string().trim().max(2000).default('') })
export const problemResolveWithTaskSchema = problemResolveSchema.extend({ taskDisposition: z.enum(['cancel', 'delete']).optional() })
export const problemListQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  apartmentId: z.uuid({ error: 'Некорректный апартамент' }).optional()
}).strict()
export const problemExpenseSchema = z.object({
  occurredOn: z.iso.date(),
  amountEur: amountSchema,
  description: z.string().trim().min(1, 'Введите описание').max(200)
})
export const problemTaskInputSchema = z.object({
  assigneeId: z.uuid({ error: 'Выберите исполнителя' }),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueOn: z.iso.date().nullable().optional(),
  ownerCostEur: taskCostSchema.optional().default(0),
  checklist: z.array(z.object({ label: z.string().trim().min(1).max(200), checked: z.boolean() })).max(200).default([])
})
export type ProblemInput = z.infer<typeof problemInputSchema>
export type ProblemListQuery = z.infer<typeof problemListQuerySchema>
export type ProblemExpenseInput = z.infer<typeof problemExpenseSchema>
