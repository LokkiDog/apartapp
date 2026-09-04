import { z } from 'zod'
import Decimal from 'decimal.js'
import { specialServiceIconNames } from '../config/special-service-icons'

export const moneyEurSchema = z.number().finite().nonnegative().max(9_999_999_999.99).transform(value => Number(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))

export const userRoleSchema = z.enum(['administrator', 'manager', 'cleaner'])
export function isApartmentOwnerEligible(roles: readonly string[]) {
  return roles.includes('manager') || roles.includes('administrator')
}
export const appLocaleSchema = z.enum(['ru', 'en', 'he'])
export type AppLocale = z.infer<typeof appLocaleSchema>
export const hotelStatusSchema = z.enum(['active', 'archived'])
export const apartmentStatusSchema = z.enum(['active', 'inactive', 'archived'])
export const cleaningStatusSchema = z.enum(['unassigned', 'assigned', 'in_progress', 'completed', 'canceled'])
export const taskStatusSchema = z.enum(['open', 'in_progress', 'completed', 'canceled'])
export const taskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])
export const inventoryMovementSchema = z.enum(['replenishment', 'usage', 'adjustment_in', 'adjustment_out'])

export const hotelInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(500),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180)
})

export const hotelReverseGeocodeQuerySchema = z.object({
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180)
}).strict()

const tariffFields = {
  cleanerPoolEur: moneyEurSchema,
  laundryEur: moneyEurSchema,
  serviceEur: moneyEurSchema
}

function withCalculatedTariff<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({ ...shape, ...tariffFields }).transform(value => {
    const tariff = value as typeof value & { cleanerPoolEur: number, laundryEur: number, serviceEur: number }
    return {
      ...value,
      ownerTotalEur: Number(new Decimal(tariff.cleanerPoolEur).plus(tariff.laundryEur).plus(tariff.serviceEur).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    }
  })
}

const checklistLabelsSchema = z.array(z.string().trim().min(1).max(200)).max(100)
const apartmentTypeAutoWriteOffSchema = z.object({ consumableId: z.uuid(), quantity: z.coerce.number().finite().positive().max(9_999_999.999) })
export const apartmentTypeInputSchema = withCalculatedTariff({
  name: z.string().trim().min(1).max(100),
  defaultChecklist: checklistLabelsSchema.default(['Сменить белье и полотенца', 'Проверить санузел и кухню', 'Проверить расходники']),
  autoWriteOffs: z.array(apartmentTypeAutoWriteOffSchema).max(500).default([]).superRefine((rules, context) => {
    if (new Set(rules.map(rule => rule.consumableId)).size !== rules.length) context.addIssue({ code: 'custom', message: 'Расходники в автосписании не должны повторяться' })
  })
})
const apartmentTariffInputSchema = withCalculatedTariff({})
const apartmentManagerIdsSchema = z.array(z.uuid({ error: 'Выберите корректных собственников' })).max(100).superRefine((managerIds, context) => {
  if (new Set(managerIds).size !== managerIds.length) context.addIssue({ code: 'custom', message: 'Собственники не должны повторяться' })
})

export const apartmentInputSchema = z.object({
  hotelId: z.uuid({ error: 'Выберите апарт-отель' }),
  managerIds: apartmentManagerIdsSchema.default([]),
  apartmentTypeId: z.uuid({ error: 'Выберите тип апартамента' }),
  name: z.string().trim().min(1, 'Введите название').max(160, 'Название не должно превышать 160 символов'),
  building: z.string().trim().max(100, 'Корпус не должен превышать 100 символов').optional().default(''),
  locationDetails: z.string().trim().max(250, 'Расположение не должно превышать 250 символов').optional().default(''),
  capacity: z.coerce.number().int('Укажите целое число').positive('Укажите хотя бы одного гостя').max(50, 'Максимум 50 гостей'),
  rooms: z.coerce.number().int('Укажите целое число').positive('Укажите хотя бы одну комнату').max(20, 'Максимум 20 комнат'),
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Укажите время заезда'),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Укажите время выезда'),
  instructions: z.string().max(5000, 'Инструкции не должны превышать 5000 символов').optional().default(''),
  status: apartmentStatusSchema.optional().default('active'),
  tariffOverride: apartmentTariffInputSchema.optional()
})
export const apartmentUpdateSchema = apartmentInputSchema.partial().extend({ managerIds: apartmentManagerIdsSchema.optional() })

export const specialServiceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceEur: moneyEurSchema,
  managerSharePercent: z.coerce.number().int().min(0).max(100),
  active: z.boolean().default(true),
  iconName: z.enum(specialServiceIconNames).optional()
})

export const stayInputSchema = z.object({
  apartmentId: z.uuid(),
  checkInOn: z.iso.date(),
  checkOutOn: z.iso.date(),
  adultCount: z.coerce.number().int().min(1).max(50),
  childCount: z.coerce.number().int().min(0).max(50),
  specialRequests: z.string().max(2000).optional().default(''),
  guestName: z.string().trim().max(160).optional().default(''),
  guestPhone: z.string().trim().max(50).optional().default(''),
  guestComment: z.string().max(2000).optional().default(''),
  serviceIds: z.array(z.uuid()).default([]),
  cashAmountEur: moneyEurSchema.nullable().optional()
}).superRefine((value, context) => {
  if (value.checkOutOn <= value.checkInOn) {
    context.addIssue({ code: 'custom', path: ['checkOutOn'], message: 'Выезд должен быть позже заезда' })
  }
})

const optionalApartmentIdsSchema = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(values.map(item => String(item).trim()).filter(Boolean))]
}, z.array(z.uuid({ error: 'Некорректный апартамент' })).min(1, 'Выберите хотя бы один апартамент').optional())

export const stayListQuerySchema = z.object({
  hotelId: z.uuid({ error: 'Некорректный отель' }).optional(),
  apartmentIds: optionalApartmentIdsSchema,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  includeUncleaned: z.union([z.literal('true'), z.literal('false'), z.boolean()]).transform(value => value === true || value === 'true').optional(),
  onlyVika: z.union([z.literal('true'), z.literal('false'), z.boolean()]).transform(value => value === true || value === 'true').optional()
}).strict().superRefine((value, context) => {
  if (value.hotelId && value.apartmentIds) {
    context.addIssue({ code: 'custom', path: ['apartmentIds'], message: 'Выберите отель или апартаменты' })
  }
})

export type StayListQuery = z.infer<typeof stayListQuerySchema>

export const cleaningAssignmentInputSchema = z.object({ cleanerIds: z.array(z.uuid()).min(1), scheduledOn: z.iso.date() })
export const cleaningTariffOverrideSchema = withCalculatedTariff({ reason: z.string().trim().min(3).max(1000) })
const cleaningChecklistSchema = z.array(z.object({ label: z.string().trim().min(1).max(200), checked: z.boolean() })).max(100)
export const cleaningInputSchema = withCalculatedTariff({
  apartmentId: z.uuid(),
  stayId: z.uuid().nullable().optional(),
  cleanerIds: z.array(z.uuid()).default([]),
  scheduledOn: z.iso.date(),
  isUrgent: z.boolean().optional(),
  urgencyOverride: z.boolean().nullable().optional(),
  checklist: cleaningChecklistSchema.optional()
})
export const cleaningUpdateSchema = withCalculatedTariff({
  cleanerIds: z.array(z.uuid()).default([]),
  scheduledOn: z.iso.date(),
  isUrgent: z.boolean().optional(),
  urgencyOverride: z.boolean().nullable().optional(),
  apartmentId: z.uuid().optional(),
  stayId: z.uuid().nullable().optional(),
  checklist: cleaningChecklistSchema.optional(),
  reason: z.string().trim().max(1000).default('')
})

export const cleaningRouteUpdateSchema = z.object({
  cleanerId: z.uuid(),
  scheduledOn: z.iso.date(),
  cleaningIds: z.array(z.uuid()).min(1).max(500)
}).superRefine((value, context) => {
  if (new Set(value.cleaningIds).size !== value.cleaningIds.length) {
    context.addIssue({ code: 'custom', path: ['cleaningIds'], message: 'Уборки в маршруте не должны повторяться' })
  }
})

export const completionInputSchema = z.object({
  checklist: z.array(z.object({ label: z.string().min(1), checked: z.boolean() })),
  comment: z.string().max(2000).default(''),
  hasProblem: z.boolean().default(false),
  problemDescription: z.string().max(2000).default(''),
  inventoryReports: z.array(z.object({
    consumableId: z.uuid(),
    usedQuantity: z.coerce.number().finite().nonnegative().max(9_999_999.999),
    remainingQuantity: z.coerce.number().finite().nonnegative().max(9_999_999.999)
  })).max(500).optional()
}).superRefine((value, context) => {
  if (value.hasProblem && !value.problemDescription.trim()) {
    context.addIssue({ code: 'custom', path: ['problemDescription'], message: 'Опишите проблему' })
  }
})

export const workProgressInputSchema = z.object({
  checklist: z.array(z.object({ label: z.string().min(1), checked: z.boolean() })),
  comment: z.string().max(2000).default(''),
  hasProblem: z.boolean().default(false),
  problemDescription: z.string().max(2000).default(''),
  inventoryReports: z.array(z.object({
    consumableId: z.uuid(),
    usedQuantity: z.coerce.number().finite().nonnegative().max(9_999_999.999),
    remainingQuantity: z.coerce.number().finite().nonnegative().max(9_999_999.999)
  })).max(500).optional()
}).superRefine((value, context) => {
  if (value.hasProblem && !value.problemDescription.trim()) {
    context.addIssue({ code: 'custom', path: ['problemDescription'], message: 'Опишите проблему' })
  }
})

export const cleaningInventoryReportInputSchema = z.object({
  reports: z.array(z.object({
    consumableId: z.uuid(),
    usedQuantity: z.coerce.number().finite().nonnegative().max(9_999_999.999),
    remainingQuantity: z.coerce.number().finite().nonnegative().max(9_999_999.999)
  })).max(500)
})

export const taskInputSchema = z.object({
  apartmentId: z.uuid(),
  assigneeId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  priority: taskPrioritySchema.default('normal'),
  dueOn: z.iso.date().nullable().optional(),
  ownerCostEur: moneyEurSchema.default(0),
  checklist: z.array(z.object({ label: z.string().min(1), checked: z.boolean() })).default([])
})

export const taskUpdateSchema = taskInputSchema.partial().extend({ status: taskStatusSchema.optional() })

export const consumableInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(32)
})

export const inventoryReplenishmentInputSchema = z.object({
  consumableId: z.uuid(),
  quantity: z.coerce.number().positive(),
  unitCostEur: moneyEurSchema,
  note: z.string().max(500).default(''),
  minimumQuantity: z.coerce.number().int('Порог должен быть целым числом').nonnegative('Порог не может быть отрицательным').default(0),
  targetQuantity: z.coerce.number().int('Целевой остаток должен быть целым числом').nonnegative('Целевой остаток не может быть отрицательным').default(0)
}).superRefine((value, context) => {
  if (value.minimumQuantity > 0 && value.targetQuantity <= value.minimumQuantity) {
    context.addIssue({ code: 'custom', path: ['targetQuantity'], message: 'Целевой остаток должен быть больше порога пополнения' })
  }
})

export const inventoryStockUpdateInputSchema = z.object({
  quantity: z.coerce.number().finite().nonnegative(),
  unitCostEur: moneyEurSchema,
  note: z.string().max(500).default(''),
  minimumQuantity: z.coerce.number().int('Порог должен быть целым числом').nonnegative('Порог не может быть отрицательным').default(0),
  targetQuantity: z.coerce.number().int('Целевой остаток должен быть целым числом').nonnegative('Целевой остаток не может быть отрицательным').default(0)
}).superRefine((value, context) => {
  if (value.minimumQuantity > 0 && value.targetQuantity <= value.minimumQuantity) {
    context.addIssue({ code: 'custom', path: ['targetQuantity'], message: 'Целевой остаток должен быть больше порога пополнения' })
  }
})

export const inventoryUsageInputSchema = z.object({
  consumableId: z.uuid(),
  quantity: z.coerce.number().positive(),
  sourceType: z.enum(['cleaning', 'task']),
  sourceId: z.uuid(),
  note: z.string().max(500).default('')
})

export type UserRole = z.infer<typeof userRoleSchema>
export type HotelInput = z.infer<typeof hotelInputSchema>
export type ApartmentInput = z.infer<typeof apartmentInputSchema>
export type StayInput = z.infer<typeof stayInputSchema>
