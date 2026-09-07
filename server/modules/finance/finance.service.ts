import { and, asc, desc, eq, gte, inArray, lt, lte, or } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db } from '../../infrastructure/database/client'
import { apartmentManagers, apartments, cleaningProblems, financialEntries, hotels, managerExpenseReportLines, managerExpenseReports } from '../../infrastructure/database/schema'
import { notifyUsers } from '../../infrastructure/notification/publish'
import { expenseInputSchema, expenseListQuerySchema, type ExpenseListQuery } from '@contracts/expense'
import { managerExpenseReportSaveSchema, type managerExpenseCategorySchema } from '@contracts/report'
import type { Actor } from '../../infrastructure/auth/actor'
import { canManageApartment, managedApartmentIds, requireRole } from '../../infrastructure/auth/actor'
import { categoryVisibilityFromReport, defaultManagerExpenseCategoryVisibility, enabledManagerExpenseLines, managerExpenseTotal, type ManagerExpenseCategoryVisibility } from './manager-expense-report'

type Category = typeof managerExpenseCategorySchema._output
type Line = { id: string, category: Category, description: string, occurredOn: string | null, amountEur: number, position: number, included: boolean, problemId: string | null }
type SavedLine = Omit<Line, 'id'>
const order: Category[] = ['cleaning', 'inventory', 'task', 'other']

async function getManagerTeamSnapshot(organizationId: string, apartmentId: string, database: typeof db = db) {
  const assignments = await database.query.apartmentManagers.findMany({
    where: and(eq(apartmentManagers.apartmentId, apartmentId), eq(apartmentManagers.organizationId, organizationId)),
    with: { manager: { columns: { id: true, name: true } } }
  })
  return assignments.map(assignment => assignment.manager).sort((left, right) => left.id.localeCompare(right.id))
}

export async function createFinancialEntry(input: {
  organizationId: string; apartmentId: string; type: 'cleaning_charge' | 'inventory_charge' | 'task_charge' | 'guest_service_charge' | 'compensation' | 'manual_expense'; visibility: 'administrator' | 'manager'; amountEur: number; occurredOn: string; description: string; sourceType: string; sourceId: string; createdById: string; problemId?: string | null
}, database: typeof db = db) {
  const apartment = await database.query.apartments.findFirst({ where: and(eq(apartments.id, input.apartmentId), eq(apartments.organizationId, input.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  const managerTeamSnapshot = await getManagerTeamSnapshot(input.organizationId, input.apartmentId, database)
  const [entry] = await database.insert(financialEntries).values({ ...input, managerTeamSnapshot }).onConflictDoNothing().returning()
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
  const entries = await db.select({ id: financialEntries.id, type: financialEntries.type, description: financialEntries.description, occurredOn: financialEntries.occurredOn, amountEur: financialEntries.amountEur, problemId: financialEntries.problemId })
    .from(financialEntries).where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.apartmentId, apartmentId), inArray(financialEntries.type, ['cleaning_charge', 'inventory_charge', 'task_charge', 'manual_expense']), gte(financialEntries.occurredOn, start), lt(financialEntries.occurredOn, end)))
    .orderBy(asc(financialEntries.occurredOn), asc(financialEntries.createdAt))
  const lines: Line[] = []
  let position = 0
  for (const entry of entries.filter(entry => !entry.problemId)) {
    const category: Category = entry.type === 'cleaning_charge' ? 'cleaning' : entry.type === 'inventory_charge' ? 'inventory' : entry.type === 'task_charge' ? 'task' : 'other'
    const description = category === 'inventory' ? entry.description.replace(/^Расход:\s*/u, '') : entry.description
    lines.push({ id: `source-${entry.id}`, category, description, occurredOn: entry.occurredOn, amountEur: entry.amountEur, position: position++, included: true, problemId: null })
  }
  const problems = await db.query.cleaningProblems.findMany({ where: and(eq(cleaningProblems.organizationId, organizationId), eq(cleaningProblems.apartmentId, apartmentId)) })
  const problemIds = problems.map(problem => problem.id)
  const problemExpenses = problemIds.length ? await db.select({ problemId: financialEntries.problemId, amountEur: financialEntries.amountEur }).from(financialEntries).where(and(eq(financialEntries.organizationId, organizationId), inArray(financialEntries.problemId, problemIds))) : []
  for (const problem of problems) {
    const occurredOn = (problem.resolvedAt ?? problem.createdAt).toISOString().slice(0, 10)
    if (occurredOn < start || occurredOn >= end) continue
    const amountEur = Number(problemExpenses.filter(expense => expense.problemId === problem.id).reduce((sum, expense) => sum.plus(expense.amountEur), new Decimal(0)).toDecimalPlaces(2))
    if (!amountEur) continue
    lines.push({ id: `problem-${problem.id}`, category: 'task', description: problem.description, occurredOn, amountEur, position: position++, included: Boolean(problem.resolvedAt), problemId: problem.id })
  }
  return sort(lines)
}

async function apartmentForReport(actor: Actor, apartmentId: string) {
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)), with: { managerAssignments: { with: { manager: { columns: { id: true, name: true } } } } } })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  return apartment
}
async function storedReport(organizationId: string, apartmentId: string, month: string) {
  return db.query.managerExpenseReports.findFirst({ where: and(eq(managerExpenseReports.organizationId, organizationId), eq(managerExpenseReports.apartmentId, apartmentId), eq(managerExpenseReports.month, `${month}-01`)), with: { lines: true } })
}
function managerLines(lines: Line[]) {
  const inventory = lines.filter(line => line.category === 'inventory')
  if (!inventory.length) return lines
  return sort([...lines.filter(line => line.category !== 'inventory'), { id: 'manager-inventory-total', category: 'inventory' as const, description: 'Расходники', occurredOn: null, amountEur: total(inventory), position: inventory[0]!.position, included: true, problemId: null }])
}
function reportResponse(apartment: Awaited<ReturnType<typeof apartmentForReport>>, month: string, report: Awaited<ReturnType<typeof storedReport>>, sourceLines: Line[], condensed = false, overrideLines?: Line[]) {
  const rawLines = overrideLines ?? (report ? sort(report.lines.map(line => ({ id: line.id, category: line.category, description: line.description, occurredOn: line.occurredOn, amountEur: line.amountEur, position: line.position, included: line.included, problemId: line.problemId }))) : sourceLines)
  const categoryVisibility = categoryVisibilityFromReport(report)
  const lines = condensed ? managerLines(enabledManagerExpenseLines(rawLines, categoryVisibility)) : rawLines
  return { apartment: { id: apartment.id, name: apartment.name, managerNames: apartment.managerAssignments.map(assignment => assignment.manager.name).sort((left, right) => left.localeCompare(right, 'ru')) }, month, materialized: Boolean(report), published: Boolean(report?.publishedAt), publishedAt: report?.publishedAt?.toISOString() ?? null, categoryVisibility, lines, totalEur: managerExpenseTotal(rawLines, categoryVisibility) }
}

export async function listManagerExpenseReports(actor: Actor, month: string) {
  range(month)
  if (!actor.roles.includes('administrator') && !actor.roles.includes('manager')) throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  const criteria = [eq(apartments.organizationId, actor.organizationId)]
  const managedIds = await managedApartmentIds(actor)
  if (managedIds && !managedIds.length) return []
  if (managedIds) criteria.push(inArray(apartments.id, managedIds))
  const apartmentRows = await db.query.apartments.findMany({ where: and(...criteria), with: { hotel: { columns: { name: true } }, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } } } })
  const reports = await Promise.all(apartmentRows.map(async apartment => {
    const report = await storedReport(actor.organizationId, apartment.id, month)
    if (!actor.roles.includes('administrator') && !report?.publishedAt) return null
    const lines = report ? report.lines.map(line => ({ id: line.id, category: line.category, description: line.description, occurredOn: line.occurredOn, amountEur: line.amountEur, position: line.position, included: line.included, problemId: line.problemId })) : await automaticLines(actor.organizationId, apartment.id, month)
    return { apartmentId: apartment.id, apartmentName: apartment.name, hotelName: apartment.hotel.name, managerNames: apartment.managerAssignments.map(assignment => assignment.manager.name).sort((left, right) => left.localeCompare(right, 'ru')), materialized: Boolean(report), published: Boolean(report?.publishedAt), totalEur: managerExpenseTotal(lines, categoryVisibilityFromReport(report)) }
  }))
  return reports.filter(Boolean)
}

export async function getManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  range(month)
  const apartment = await apartmentForReport(actor, apartmentId)
  const report = await storedReport(actor.organizationId, apartmentId, month)
  if (!actor.roles.includes('administrator') && (!actor.roles.includes('manager') || !(await canManageApartment(actor, apartmentId)) || !report?.publishedAt)) throw createError({ statusCode: 404, statusMessage: 'Отчёт недоступен' })
  const isAdministrator = actor.roles.includes('administrator')
  let sourceLines = report ? [] : await automaticLines(actor.organizationId, apartmentId, month)
  if (isAdministrator && report) {
    const storedInventory = report.lines.filter(line => line.category === 'inventory')
    if (storedInventory.length && storedInventory.every(line => line.description.trim() === 'Расходники')) {
      const automatic = await automaticLines(actor.organizationId, apartmentId, month)
      const inventory = automatic.filter(line => line.category === 'inventory')
      if (inventory.length) {
        sourceLines = sort([
          ...report.lines.filter(line => line.category !== 'inventory').map(line => ({ id: line.id, category: line.category, description: line.description, occurredOn: line.occurredOn, amountEur: line.amountEur, position: line.position, included: line.included, problemId: line.problemId })),
          ...inventory
        ])
        return reportResponse(apartment, month, report, [], false, sourceLines)
      }
    }
  }
  return reportResponse(apartment, month, report, sourceLines, !isAdministrator)
}

async function replaceLines(actor: Actor, apartmentId: string, month: string, lines: SavedLine[], categoryVisibility: ManagerExpenseCategoryVisibility, publish = false) {
  const problemIds = [...new Set(lines.map(line => line.problemId).filter((id): id is string => Boolean(id)))]
  if (problemIds.length) {
    const problems = await db.select({ id: cleaningProblems.id }).from(cleaningProblems).where(and(eq(cleaningProblems.organizationId, actor.organizationId), eq(cleaningProblems.apartmentId, apartmentId), inArray(cleaningProblems.id, problemIds)))
    if (problems.length !== problemIds.length) throw createError({ statusCode: 400, statusMessage: 'Проблема не относится к этому апартаменту' })
  }
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  const now = new Date()
  const visibilityColumns = { cleaningEnabled: categoryVisibility.cleaning, inventoryEnabled: categoryVisibility.inventory, taskEnabled: categoryVisibility.task, otherEnabled: categoryVisibility.other }
  await db.transaction(async tx => {
    let reportId = existing?.id
    if (reportId) {
      await tx.update(managerExpenseReports).set({ ...visibilityColumns, publishedAt: publish ? now : existing!.publishedAt, publishedById: publish ? actor.id : existing!.publishedById, updatedAt: now }).where(eq(managerExpenseReports.id, reportId))
      await tx.delete(managerExpenseReportLines).where(eq(managerExpenseReportLines.reportId, reportId))
    } else {
      const [created] = await tx.insert(managerExpenseReports).values({ organizationId: actor.organizationId, apartmentId, month: `${month}-01`, ...visibilityColumns, publishedAt: publish ? now : null, publishedById: publish ? actor.id : null, updatedAt: now }).returning({ id: managerExpenseReports.id })
      reportId = created!.id
    }
    if (lines.length) await tx.insert(managerExpenseReportLines).values(lines.map((line, position) => ({ ...line, reportId: reportId!, position })))
  })
}

export async function saveManagerExpenseReport(actor: Actor, apartmentId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = managerExpenseReportSaveSchema.parse(input)
  await apartmentForReport(actor, apartmentId)
  await replaceLines(actor, apartmentId, data.month, data.lines.map((line, position) => ({ ...line, occurredOn: line.occurredOn ?? null, position, problemId: line.problemId ?? null })), data.categoryVisibility)
  return getManagerExpenseReport(actor, apartmentId, data.month)
}
export async function resetManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  requireRole(actor, 'administrator'); await apartmentForReport(actor, apartmentId)
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  const lines = await automaticLines(actor.organizationId, apartmentId, month)
  await replaceLines(actor, apartmentId, month, lines.map(({ category, description, occurredOn, amountEur, position, included, problemId }) => ({ category, description, occurredOn, amountEur, position, included, problemId })), categoryVisibilityFromReport(existing))
  return getManagerExpenseReport(actor, apartmentId, month)
}
export async function publishManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  requireRole(actor, 'administrator')
  const apartment = await apartmentForReport(actor, apartmentId)
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  if (!existing) {
    const lines = await automaticLines(actor.organizationId, apartmentId, month)
    await replaceLines(actor, apartmentId, month, lines.map(({ category, description, occurredOn, amountEur, position, included, problemId }) => ({ category, description, occurredOn, amountEur, position, included, problemId })), defaultManagerExpenseCategoryVisibility, true)
  } else if (!existing.publishedAt) await db.update(managerExpenseReports).set({ publishedAt: new Date(), publishedById: actor.id, updatedAt: new Date() }).where(eq(managerExpenseReports.id, existing.id))
  if (!existing?.publishedAt) await notifyUsers({ organizationId: actor.organizationId, userIds: apartment.managerAssignments.map(assignment => assignment.userId), type: 'manager_expense_report_published', title: 'Доступен отчёт по расходам', body: `${apartment.name} · ${month}`, href: `/statement?month=${month}&apartmentId=${apartmentId}` })
  return getManagerExpenseReport(actor, apartmentId, month)
}
export async function unpublishManagerExpenseReport(actor: Actor, apartmentId: string, month: string) {
  requireRole(actor, 'administrator')
  const existing = await storedReport(actor.organizationId, apartmentId, month)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Отчёт ещё не создан' })
  await db.update(managerExpenseReports).set({ publishedAt: null, publishedById: null, updatedAt: new Date() }).where(eq(managerExpenseReports.id, existing.id))
  return getManagerExpenseReport(actor, apartmentId, month)
}

function expenseConditions(actor: Actor, query: ExpenseListQuery) {
  const conditions = [
    eq(financialEntries.organizationId, actor.organizationId),
    or(eq(financialEntries.type, 'manual_expense'), eq(financialEntries.sourceType, 'problem_expense')),
    gte(financialEntries.occurredOn, query.from),
    lte(financialEntries.occurredOn, query.to)
  ]
  if (query.apartmentId) conditions.push(eq(financialEntries.apartmentId, query.apartmentId))
  return conditions
}

export async function listExpenses(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const query = expenseListQuerySchema.parse(input)
  return db.select({
    id: financialEntries.id,
    apartmentId: financialEntries.apartmentId,
    apartmentName: apartments.name,
    hotelName: hotels.name,
    occurredOn: financialEntries.occurredOn,
    amountEur: financialEntries.amountEur,
    description: financialEntries.description,
    problemId: financialEntries.problemId,
    createdAt: financialEntries.createdAt
  })
    .from(financialEntries)
    .innerJoin(apartments, eq(financialEntries.apartmentId, apartments.id))
    .innerJoin(hotels, eq(apartments.hotelId, hotels.id))
    .where(and(...expenseConditions(actor, query)))
    .orderBy(desc(financialEntries.occurredOn), desc(financialEntries.createdAt))
}

export async function createExpense(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = expenseInputSchema.parse(input)
  const entry = await createFinancialEntry({
    organizationId: actor.organizationId,
    apartmentId: data.apartmentId,
    type: 'manual_expense',
    visibility: 'manager',
    amountEur: data.amountEur,
    occurredOn: data.occurredOn,
    description: data.description,
    sourceType: 'manual_expense',
    sourceId: crypto.randomUUID(),
    createdById: actor.id
  })
  if (!entry) throw createError({ statusCode: 409, statusMessage: 'Не удалось добавить расход' })
  return entry
}

export async function updateExpense(actor: Actor, expenseId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = expenseInputSchema.parse(input)
  const existing = await db.query.financialEntries.findFirst({
    where: and(eq(financialEntries.id, expenseId), eq(financialEntries.organizationId, actor.organizationId), eq(financialEntries.type, 'manual_expense'))
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Расход не найден' })
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, data.apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  const managerTeamSnapshot = await getManagerTeamSnapshot(actor.organizationId, data.apartmentId)
  const [updated] = await db.update(financialEntries)
    .set({ apartmentId: data.apartmentId, occurredOn: data.occurredOn, amountEur: data.amountEur, description: data.description, managerTeamSnapshot })
    .where(and(eq(financialEntries.id, expenseId), eq(financialEntries.organizationId, actor.organizationId), eq(financialEntries.type, 'manual_expense')))
    .returning()
  return updated!
}

export async function deleteExpense(actor: Actor, expenseId: string) {
  requireRole(actor, 'administrator')
  const [deleted] = await db.delete(financialEntries)
    .where(and(eq(financialEntries.id, expenseId), eq(financialEntries.organizationId, actor.organizationId), eq(financialEntries.type, 'manual_expense')))
    .returning({ id: financialEntries.id })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Расход не найден' })
  return { ok: true }
}
