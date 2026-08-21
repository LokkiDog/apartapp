import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db } from '../../infrastructure/database/client'
import { apartments, financialEntries, managerExpenseReportLines, managerExpenseReports } from '../../infrastructure/database/schema'
import { notifyUsers } from '../../infrastructure/notification/publish'
import { managerExpenseReportSaveSchema, type managerExpenseCategorySchema } from '@contracts/report'
import type { Actor } from '../../infrastructure/auth/actor'
import { requireRole } from '../../infrastructure/auth/actor'

type Category = typeof managerExpenseCategorySchema._output
type Line = { id: string, category: Category, description: string, occurredOn: string | null, amountEur: number, position: number }
type SavedLine = Omit<Line, 'id'>
const order: Category[] = ['cleaning', 'inventory', 'task']

export async function createFinancialEntry(input: {
  organizationId: string; apartmentId: string; type: 'cleaning_charge' | 'inventory_charge' | 'task_charge' | 'guest_service_charge' | 'compensation'; visibility: 'administrator' | 'manager'; amountEur: number; occurredOn: string; description: string; sourceType: string; sourceId: string; createdById: string
}, database: typeof db = db) {
  const apartment = await database.query.apartments.findFirst({ where: eq(apartments.id, input.apartmentId) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  const [entry] = await database.insert(financialEntries).values({ ...input, managerId: apartment.managerId }).onConflictDoNothing().returning()
  return entry
}

function range(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber > 12) throw createError({ statusCode: 400, statusMessage: 'Неверный месяц' })
  return { start: `${month}-01`, end: new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10) }
}
function total(lines: Array<Pick<Line, 'amountEur'>>) { return Number(lines.reduce((sum, line) => sum.plus(line.amountEur), new Decimal(0)).toDecimalPlaces(2)) }
function sort(lines: Line[]) { return [...lines].sort((left, right) => order.indexOf(left.category) - order.indexOf(right.category) || left.position - right.position) }

async function automaticLines(organizationId: string, apartmentId: string, month: string): Promise<Line[]> {
  const { start, end } = range(month)
  const entries = await db.select({ id: financialEntries.id, type: financialEntries.type, description: financialEntries.description, occurredOn: financialEntries.occurredOn, amountEur: financialEntries.amountEur })
    .from(financialEntries).where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.apartmentId, apartmentId), inArray(financialEntries.type, ['cleaning_charge', 'inventory_charge', 'task_charge']), gte(financialEntries.occurredOn, start), lt(financialEntries.occurredOn, end)))
    .orderBy(asc(financialEntries.occurredOn), asc(financialEntries.createdAt))
  const lines: Line[] = []
  let position = 0
  for (const entry of entries) {
    const category: Category = entry.type === 'cleaning_charge' ? 'cleaning' : entry.type === 'inventory_charge' ? 'inventory' : 'task'
    const description = category === 'inventory' ? entry.description.replace(/^Расход:\s*/u, '') : entry.description
    lines.push({ id: `source-${entry.id}`, category, description, occurredOn: entry.occurredOn, amountEur: entry.amountEur, position: position++ })
  }
  return sort(lines)
}

async function apartmentForReport(actor: Actor, apartmentId: string) {
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)), with: { manager: true } })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment
}
async function storedReport(organizationId: string, apartmentId: string, month: string) {
  return db.query.managerExpenseReports.findFirst({ where: and(eq(managerExpenseReports.organizationId, organizationId), eq(managerExpenseReports.apartmentId, apartmentId), eq(managerExpenseReports.month, `${month}-01`)), with: { lines: true } })
}
function managerLines(lines: Line[]) {
  const inventory = lines.filter(line => line.category === 'inventory')
  if (!inventory.length) return lines
  return sort([...lines.filter(line => line.category !== 'inventory'), { id: 'manager-inventory-total', category: 'inventory' as const, description: 'Расходники', occurredOn: null, amountEur: total(inventory), position: inventory[0]!.position }])
}
function reportResponse(apartment: Awaited<ReturnType<typeof apartmentForReport>>, month: string, report: Awaited<ReturnType<typeof storedReport>>, sourceLines: Line[], condensed = false, overrideLines?: Line[]) {
  const rawLines = overrideLines ?? (report ? sort(report.lines.map(line => ({ id: line.id, category: line.category, description: line.description, occurredOn: line.occurredOn, amountEur: line.amountEur, position: line.position }))) : sourceLines)
  const lines = condensed ? managerLines(rawLines) : rawLines
  return { apartment: { id: apartment.id, name: apartment.name, managerName: apartment.manager?.name ?? null }, month, materialized: Boolean(report), published: Boolean(report?.publishedAt), publishedAt: report?.publishedAt?.toISOString() ?? null, lines, totalEur: total(lines) }
}

export async function listManagerExpenseReports(actor: Actor, month: string) {
  range(month)
  if (!actor.roles.includes('administrator') && !actor.roles.includes('manager')) throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  const criteria = [eq(apartments.organizationId, actor.organizationId)]
  if (!actor.roles.includes('administrator')) criteria.push(eq(apartments.managerId, actor.id))
  const apartmentRows = await db.query.apartments.findMany({ where: and(...criteria), with: { manager: true } })
  const reports = await Promise.all(apartmentRows.map(async apartment => {
    const report = await storedReport(actor.organizationId, apartment.id, month)
    if (!actor.roles.includes('administrator') && !report?.publishedAt) return null
    const lines = report ? report.lines.map(line => ({ id: line.id, category: line.category, description: line.description, occurredOn: line.occurredOn, amountEur: line.amountEur, position: line.position })) : await automaticLines(actor.organizationId, apartment.id, month)
    return { apartmentId: apartment.id, apartmentName: apartment.name, managerName: apartment.manager?.name ?? null, materialized: Boolean(report), published: Boolean(report?.publishedAt), totalEur: total(lines) }
  }))
  return reports.filter(Boolean)
}

export async function getManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  range(month)
  const apartment = await apartmentForReport(actor, apartmentId)
  const report = await storedReport(actor.organizationId, apartmentId, month)
  if (!actor.roles.includes('administrator') && (!actor.roles.includes('manager') || apartment.managerId !== actor.id || !report?.publishedAt)) throw createError({ statusCode: 404, statusMessage: 'Отчёт недоступен' })
  const isAdministrator = actor.roles.includes('administrator')
  let sourceLines = report ? [] : await automaticLines(actor.organizationId, apartmentId, month)
  if (isAdministrator && report) {
    const storedInventory = report.lines.filter(line => line.category === 'inventory')
    if (storedInventory.length && storedInventory.every(line => line.description.trim() === 'Расходники')) {
      const automatic = await automaticLines(actor.organizationId, apartmentId, month)
      const inventory = automatic.filter(line => line.category === 'inventory')
      if (inventory.length) {
        sourceLines = sort([
          ...report.lines.filter(line => line.category !== 'inventory').map(line => ({ id: line.id, category: line.category, description: line.description, occurredOn: line.occurredOn, amountEur: line.amountEur, position: line.position })),
          ...inventory
        ])
        return reportResponse(apartment, month, report, [], false, sourceLines)
      }
    }
  }
  return reportResponse(apartment, month, report, sourceLines, !isAdministrator)
}

async function replaceLines(actor: Actor, apartmentId: string, month: string, lines: SavedLine[], publish = false) {
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  const now = new Date()
  await db.transaction(async tx => {
    let reportId = existing?.id
    if (reportId) {
      await tx.update(managerExpenseReports).set({ publishedAt: publish ? now : existing!.publishedAt, publishedById: publish ? actor.id : existing!.publishedById, updatedAt: now }).where(eq(managerExpenseReports.id, reportId))
      await tx.delete(managerExpenseReportLines).where(eq(managerExpenseReportLines.reportId, reportId))
    } else {
      const [created] = await tx.insert(managerExpenseReports).values({ organizationId: actor.organizationId, apartmentId, month: `${month}-01`, publishedAt: publish ? now : null, publishedById: publish ? actor.id : null, updatedAt: now }).returning({ id: managerExpenseReports.id })
      reportId = created!.id
    }
    if (lines.length) await tx.insert(managerExpenseReportLines).values(lines.map((line, position) => ({ ...line, reportId: reportId!, position })))
  })
}

export async function saveManagerExpenseReport(actor: Actor, apartmentId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = managerExpenseReportSaveSchema.parse(input)
  await apartmentForReport(actor, apartmentId)
  await replaceLines(actor, apartmentId, data.month, data.lines.map((line, position) => ({ ...line, occurredOn: line.occurredOn ?? null, position })))
  return getManagerExpenseReport(actor, apartmentId, data.month)
}
export async function resetManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  requireRole(actor, 'administrator'); await apartmentForReport(actor, apartmentId)
  const lines = await automaticLines(actor.organizationId, apartmentId, month)
  await replaceLines(actor, apartmentId, month, lines.map(({ category, description, occurredOn, amountEur, position }) => ({ category, description, occurredOn, amountEur, position })))
  return getManagerExpenseReport(actor, apartmentId, month)
}
export async function publishManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  requireRole(actor, 'administrator')
  const apartment = await apartmentForReport(actor, apartmentId)
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  if (!existing) {
    const lines = await automaticLines(actor.organizationId, apartmentId, month)
    await replaceLines(actor, apartmentId, month, lines.map(({ category, description, occurredOn, amountEur, position }) => ({ category, description, occurredOn, amountEur, position })), true)
  } else if (!existing.publishedAt) await db.update(managerExpenseReports).set({ publishedAt: new Date(), publishedById: actor.id, updatedAt: new Date() }).where(eq(managerExpenseReports.id, existing.id))
  if (!existing?.publishedAt && apartment.managerId) await notifyUsers({ organizationId: actor.organizationId, userIds: [apartment.managerId], type: 'manager_expense_report_published', title: 'Доступен отчёт по расходам', body: `${apartment.name} · ${month}`, href: `/statement?month=${month}&apartmentId=${apartmentId}` })
  return getManagerExpenseReport(actor, apartmentId, month)
}
export async function unpublishManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  requireRole(actor, 'administrator')
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Отчёт ещё не создан' })
  await db.update(managerExpenseReports).set({ publishedAt: null, publishedById: null, updatedAt: new Date() }).where(eq(managerExpenseReports.id, existing.id))
  return getManagerExpenseReport(actor, apartmentId, month)
}
