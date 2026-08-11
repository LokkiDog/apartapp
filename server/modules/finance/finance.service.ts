import { and, asc, eq, gte, lt } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db } from '../../infrastructure/database/client'
import { apartments, financialEntries } from '../../infrastructure/database/schema'
import type { Actor } from '../../infrastructure/auth/actor'

export async function createFinancialEntry(input: {
  organizationId: string
  apartmentId: string
  type: 'cleaning_charge' | 'inventory_charge' | 'task_charge' | 'guest_service_charge' | 'compensation'
  visibility: 'administrator' | 'manager'
  amountEur: number
  occurredOn: string
  description: string
  sourceType: string
  sourceId: string
  createdById: string
}, database: typeof db = db) {
  const apartment = await database.query.apartments.findFirst({ where: eq(apartments.id, input.apartmentId) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  const [entry] = await database.insert(financialEntries).values({ ...input, managerId: apartment.managerId }).onConflictDoNothing().returning()
  return entry
}

export async function managerStatement(actor: Actor, month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber > 12) throw createError({ statusCode: 400, statusMessage: 'Неверный месяц' })
  const start = `${month}-01`
  const endDate = new Date(Date.UTC(year, monthNumber, 1))
  const end = endDate.toISOString().slice(0, 10)
  const criteria = [
    eq(financialEntries.organizationId, actor.organizationId),
    eq(financialEntries.visibility, 'manager'),
    gte(financialEntries.occurredOn, start),
    lt(financialEntries.occurredOn, end)
  ]
  if (!actor.roles.includes('administrator')) criteria.push(eq(financialEntries.managerId, actor.id))
  const entries = await db.select({
    id: financialEntries.id,
    apartmentId: financialEntries.apartmentId,
    apartmentName: apartments.name,
    type: financialEntries.type,
    amountEur: financialEntries.amountEur,
    occurredOn: financialEntries.occurredOn,
    description: financialEntries.description,
    sourceType: financialEntries.sourceType,
    sourceId: financialEntries.sourceId
  }).from(financialEntries)
    .innerJoin(apartments, eq(financialEntries.apartmentId, apartments.id))
    .where(and(...criteria))
    .orderBy(asc(apartments.name), asc(financialEntries.type), asc(financialEntries.occurredOn), asc(financialEntries.createdAt))
  const totalEur = Number(entries.reduce((sum, entry) => sum.plus(entry.amountEur), new Decimal(0)).toDecimalPlaces(2))
  return { entries, totalEur }
}
