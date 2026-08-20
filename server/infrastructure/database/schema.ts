import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}

export const userRoleEnum = pgEnum('user_role', ['administrator', 'manager', 'cleaner'])
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'blocked', 'archived'])
export const hotelStatusEnum = pgEnum('hotel_status', ['active', 'archived'])
export const apartmentStatusEnum = pgEnum('apartment_status', ['active', 'inactive', 'archived'])
export const cleaningStatusEnum = pgEnum('cleaning_status', ['unassigned', 'assigned', 'in_progress', 'completed', 'canceled'])
export const taskStatusEnum = pgEnum('task_status', ['open', 'in_progress', 'completed', 'canceled'])
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'normal', 'high', 'urgent'])
export const inventoryMovementEnum = pgEnum('inventory_movement', ['replenishment', 'usage', 'adjustment_in', 'adjustment_out'])
export const financialEntryTypeEnum = pgEnum('financial_entry_type', ['cleaning_charge', 'inventory_charge', 'task_charge', 'guest_service_charge', 'compensation'])
export const visibilityEnum = pgEnum('entry_visibility', ['administrator', 'manager'])
export const notificationTypeEnum = pgEnum('notification_type', ['stay_changed', 'work_assigned', 'work_rescheduled', 'work_canceled', 'problem'])
export const authTokenTypeEnum = pgEnum('auth_token_type', ['invitation', 'password_reset'])

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Sofia'),
  ...timestamps
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  roles: userRoleEnum('roles').array().notNull().default(sql`ARRAY['manager']::user_role[]`),
  status: userStatusEnum('status').notNull().default('invited'),
  ...timestamps
}, table => [uniqueIndex('users_organization_email_unique').on(table.organizationId, table.email)])

export const hotels = pgTable('hotels', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
  longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
  status: hotelStatusEnum('status').notNull().default('active'),
  ...timestamps
}, table => [
  check('hotel_latitude_range', sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`),
  check('hotel_longitude_range', sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`)
])

export const apartmentTypes = pgTable('apartment_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  ownerTotalEur: numeric('owner_total_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  cleanerPoolEur: numeric('cleaner_pool_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  laundryEur: numeric('laundry_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  serviceEur: numeric('service_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  defaultChecklist: jsonb('default_checklist').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ...timestamps
}, table => [
  check('apartment_type_tariff_nonnegative', sql`${table.ownerTotalEur} >= 0 AND ${table.cleanerPoolEur} >= 0 AND ${table.laundryEur} >= 0 AND ${table.serviceEur} >= 0`),
  check('apartment_type_tariff_total', sql`${table.ownerTotalEur} = ${table.cleanerPoolEur} + ${table.laundryEur} + ${table.serviceEur}`)
])

export const apartments = pgTable('apartments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  hotelId: uuid('hotel_id').notNull().references(() => hotels.id),
  managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
  apartmentTypeId: uuid('apartment_type_id').notNull().references(() => apartmentTypes.id),
  name: text('name').notNull(),
  internalCode: text('internal_code').notNull(),
  building: text('building').notNull().default(''),
  locationDetails: text('location_details').notNull().default(''),
  capacity: integer('capacity').notNull(),
  rooms: integer('rooms').notNull(),
  checkInTime: text('check_in_time').notNull(),
  checkOutTime: text('check_out_time').notNull(),
  instructions: text('instructions').notNull().default(''),
  status: apartmentStatusEnum('status').notNull().default('active'),
  tariffOverride: jsonb('tariff_override').$type<CleaningTariff | null>(),
  ...timestamps
}, table => [uniqueIndex('apartment_organization_code_unique').on(table.organizationId, table.internalCode)])

export const specialServices = pgTable('special_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  priceEur: numeric('price_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  managerSharePercent: integer('manager_share_percent').notNull(),
  active: boolean('active').notNull().default(true),
  ...timestamps
}, table => [check('special_service_price_nonnegative', sql`${table.priceEur} >= 0`)])

export const stays = pgTable('stays', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  checkInOn: date('check_in_on').notNull(),
  checkOutOn: date('check_out_on').notNull(),
  adultCount: integer('adult_count').notNull(),
  childCount: integer('child_count').notNull().default(0),
  specialRequests: text('special_requests').notNull().default(''),
  guestName: text('guest_name').notNull().default(''),
  guestPhone: text('guest_phone').notNull().default(''),
  guestComment: text('guest_comment').notNull().default(''),
  cashAmountEur: numeric('cash_amount_eur', { precision: 12, scale: 2, mode: 'number' }),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  ...timestamps
}, table => [
  check('stay_dates_order', sql`${table.checkOutOn} > ${table.checkInOn}`),
  check('stay_cash_nonnegative', sql`${table.cashAmountEur} IS NULL OR ${table.cashAmountEur} >= 0`),
  index('stay_report_dates_idx').on(table.organizationId, table.checkInOn, table.checkOutOn)
])

export const stayServices = pgTable('stay_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  stayId: uuid('stay_id').notNull().references(() => stays.id, { onDelete: 'cascade' }),
  specialServiceId: uuid('special_service_id').notNull().references(() => specialServices.id),
  nameSnapshot: text('name_snapshot').notNull(),
  priceEurSnapshot: numeric('price_eur_snapshot', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  managerSharePercentSnapshot: integer('manager_share_percent_snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [check('stay_service_price_nonnegative', sql`${table.priceEurSnapshot} >= 0`)])

export const cleanings = pgTable('cleanings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  stayId: uuid('stay_id').unique().references(() => stays.id),
  scheduledOn: date('scheduled_on'),
  status: cleaningStatusEnum('status').notNull().default('unassigned'),
  tariffSnapshot: jsonb('tariff_snapshot').$type<CleaningTariff>().notNull(),
  checklist: jsonb('checklist').$type<ChecklistItem[]>().notNull().default([]),
  comment: text('comment').notNull().default(''),
  hasProblem: boolean('has_problem').notNull().default(false),
  problemDescription: text('problem_description').notNull().default(''),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps
}, table => [index('cleaning_report_date_idx').on(table.organizationId, table.scheduledOn)])

export const cleaningAssignments = pgTable('cleaning_assignments', {
  cleaningId: uuid('cleaning_id').notNull().references(() => cleanings.id, { onDelete: 'cascade' }),
  cleanerId: uuid('cleaner_id').notNull().references(() => users.id),
  routePosition: integer('route_position').notNull().default(0),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  uniqueIndex('cleaning_assignment_unique').on(table.cleaningId, table.cleanerId),
  index('cleaning_assignment_route_idx').on(table.cleanerId, table.routePosition)
])

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  assigneeId: uuid('assignee_id').references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: taskPriorityEnum('priority').notNull().default('normal'),
  status: taskStatusEnum('status').notNull().default('open'),
  dueOn: date('due_on'),
  ownerCostEur: numeric('owner_cost_eur', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  checklist: jsonb('checklist').$type<ChecklistItem[]>().notNull().default([]),
  comment: text('comment').notNull().default(''),
  hasProblem: boolean('has_problem').notNull().default(false),
  problemDescription: text('problem_description').notNull().default(''),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps
}, table => [
  check('task_owner_cost_nonnegative', sql`${table.ownerCostEur} >= 0`),
  index('task_report_date_idx').on(table.organizationId, table.dueOn)
])

export const consumables = pgTable('consumables', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  category: text('category').notNull(),
  unit: text('unit').notNull(),
  ...timestamps
})

export const apartmentConsumables = pgTable('apartment_consumables', {
  id: uuid('id').primaryKey().defaultRandom(),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  minimumQuantity: integer('minimum_quantity').notNull().default(0),
  targetQuantity: integer('target_quantity').notNull().default(0),
  active: boolean('active').notNull().default(true),
  ...timestamps
}, table => [
  uniqueIndex('apartment_consumable_unique').on(table.apartmentId, table.consumableId),
  index('apartment_consumable_report_idx').on(table.apartmentId, table.consumableId),
  check('apartment_consumable_thresholds_valid', sql`${table.minimumQuantity} >= 0 AND ${table.targetQuantity} >= 0 AND (${table.minimumQuantity} = 0 OR ${table.targetQuantity} > ${table.minimumQuantity})`)
])

export const inventoryLots = pgTable('inventory_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  remainingQuantity: numeric('remaining_quantity', { precision: 12, scale: 3 }).notNull(),
  unitCostEur: numeric('unit_cost_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  check('inventory_lot_cost_nonnegative', sql`${table.unitCostEur} >= 0`),
  index('inventory_lot_report_idx').on(table.apartmentId, table.consumableId)
])

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  type: inventoryMovementEnum('type').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  totalCostEur: numeric('total_cost_eur', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  sourceType: text('source_type'),
  sourceId: uuid('source_id'),
  origin: text('origin').notNull().default('manual'),
  note: text('note').notNull().default(''),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [check('inventory_movement_cost_nonnegative', sql`${table.totalCostEur} >= 0`)])

export const cleaningInventoryReports = pgTable('cleaning_inventory_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  cleaningId: uuid('cleaning_id').notNull().references(() => cleanings.id, { onDelete: 'cascade' }),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  usedQuantity: numeric('used_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  remainingQuantity: numeric('remaining_quantity', { precision: 12, scale: 3 }).notNull(),
  discrepancyQuantity: numeric('discrepancy_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  reportedById: uuid('reported_by_id').notNull().references(() => users.id),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
  ...timestamps
}, table => [
  uniqueIndex('cleaning_inventory_report_unique').on(table.cleaningId, table.consumableId),
  index('cleaning_inventory_report_org_idx').on(table.organizationId, table.reportedAt),
  check('cleaning_inventory_report_quantities_nonnegative', sql`${table.usedQuantity} >= 0 AND ${table.remainingQuantity} >= 0`)
])

export const financialEntries = pgTable('financial_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  apartmentId: uuid('apartment_id').notNull().references(() => apartments.id),
  managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
  type: financialEntryTypeEnum('type').notNull(),
  visibility: visibilityEnum('visibility').notNull().default('manager'),
  amountEur: numeric('amount_eur', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  occurredOn: date('occurred_on').notNull(),
  description: text('description').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  uniqueIndex('financial_source_type_id_unique').on(table.sourceType, table.sourceId, table.type),
  index('financial_report_date_idx').on(table.organizationId, table.occurredOn)
])

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  href: text('href').notNull().default('/'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => [uniqueIndex('push_endpoint_unique').on(table.endpoint)])

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: authTokenTypeEnum('type').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  uploadedById: uuid('uploaded_by_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export interface CleaningTariff {
  ownerTotalEur: number
  cleanerPoolEur: number
  laundryEur: number
  serviceEur: number
}

export interface ChecklistItem {
  label: string
  checked: boolean
}

export const usersRelations = relations(users, ({ many }) => ({
  managedApartments: many(apartments, { relationName: 'apartmentManager' }),
  createdStays: many(stays, { relationName: 'stayCreator' }),
  assignedCleanings: many(cleaningAssignments),
  assignedTasks: many(tasks, { relationName: 'taskAssignee' }),
  createdTasks: many(tasks, { relationName: 'taskCreator' })
}))

export const apartmentTypesRelations = relations(apartmentTypes, ({ many }) => ({ apartments: many(apartments) }))
export const hotelsRelations = relations(hotels, ({ many }) => ({ apartments: many(apartments) }))
export const apartmentsRelations = relations(apartments, ({ one, many }) => ({
  hotel: one(hotels, { fields: [apartments.hotelId], references: [hotels.id] }),
  manager: one(users, { fields: [apartments.managerId], references: [users.id], relationName: 'apartmentManager' }),
  type: one(apartmentTypes, { fields: [apartments.apartmentTypeId], references: [apartmentTypes.id] }),
  stays: many(stays),
  cleanings: many(cleanings),
  tasks: many(tasks)
}))

export const staysRelations = relations(stays, ({ one, many }) => ({
  apartment: one(apartments, { fields: [stays.apartmentId], references: [apartments.id] }),
  createdBy: one(users, { fields: [stays.createdById], references: [users.id], relationName: 'stayCreator' }),
  services: many(stayServices),
  cleaning: one(cleanings)
}))
export const stayServicesRelations = relations(stayServices, ({ one }) => ({
  stay: one(stays, { fields: [stayServices.stayId], references: [stays.id] }),
  service: one(specialServices, { fields: [stayServices.specialServiceId], references: [specialServices.id] })
}))
export const cleaningsRelations = relations(cleanings, ({ one, many }) => ({
  apartment: one(apartments, { fields: [cleanings.apartmentId], references: [apartments.id] }),
  stay: one(stays, { fields: [cleanings.stayId], references: [stays.id] }),
  assignments: many(cleaningAssignments),
  inventoryReports: many(cleaningInventoryReports)
}))
export const cleaningAssignmentsRelations = relations(cleaningAssignments, ({ one }) => ({
  cleaning: one(cleanings, { fields: [cleaningAssignments.cleaningId], references: [cleanings.id] }),
  cleaner: one(users, { fields: [cleaningAssignments.cleanerId], references: [users.id] })
}))
export const cleaningInventoryReportsRelations = relations(cleaningInventoryReports, ({ one }) => ({
  cleaning: one(cleanings, { fields: [cleaningInventoryReports.cleaningId], references: [cleanings.id] }),
  consumable: one(consumables, { fields: [cleaningInventoryReports.consumableId], references: [consumables.id] }),
  reportedBy: one(users, { fields: [cleaningInventoryReports.reportedById], references: [users.id] })
}))
export const tasksRelations = relations(tasks, ({ one }) => ({
  apartment: one(apartments, { fields: [tasks.apartmentId], references: [apartments.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id], relationName: 'taskAssignee' }),
  createdBy: one(users, { fields: [tasks.createdById], references: [users.id], relationName: 'taskCreator' })
}))
export const consumablesRelations = relations(consumables, ({ many }) => ({ apartmentStocks: many(apartmentConsumables) }))
export const apartmentConsumablesRelations = relations(apartmentConsumables, ({ one }) => ({
  apartment: one(apartments, { fields: [apartmentConsumables.apartmentId], references: [apartments.id] }),
  consumable: one(consumables, { fields: [apartmentConsumables.consumableId], references: [consumables.id] })
}))
