import { and, eq, inArray, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import type {
  GlobalReportResponse,
  ProcurementRow,
  ReportBreakdownRow,
  ReportFinanceEntry,
  ReportQuery,
  WorkloadCleaningRow,
  WorkloadDay,
  WorkloadTaskRow
} from '@contracts/report'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import {
  apartmentConsumables,
  apartments,
  cleanings,
  financialEntries,
  hotels,
  inventoryLots,
  stays,
  tasks,
  users
} from '../../infrastructure/database/schema'

const financeTypeLabels: Record<string, string> = {
  cleaning_charge: 'Уборки',
  inventory_charge: 'Расходники',
  task_charge: 'Работы',
  guest_service_charge: 'Дополнительные услуги',
  compensation: 'Корректировки',
  manual_expense: 'Прочее'
}

function dateInRange(date: string | null, query: ReportQuery) {
  return Boolean(date && date >= query.from && date <= query.to)
}

function dateInSofia(value: Date | null) {
  if (!value) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function decimalNumber(value: Decimal.Value, places = 2) {
  return Number(new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP))
}

function cleaningRow(cleaning: any, apartment: any): WorkloadCleaningRow {
  return {
    id: cleaning.id,
    apartmentName: apartment.name,
    hotelName: apartment.hotel.name,
    status: cleaning.status,
    cleaners: cleaning.assignments.map((assignment: any) => assignment.cleaner.name)
  }
}

function taskRow(task: any, apartment: any, userNames: Map<string, string>): WorkloadTaskRow {
  return {
    id: task.id,
    apartmentName: apartment.name,
    hotelName: apartment.hotel.name,
    title: task.title,
    status: task.status,
    assigneeName: task.assigneeId ? userNames.get(task.assigneeId) ?? null : null
  }
}

function addAmount(map: Map<string, { label: string, amount: Decimal }>, id: string, label: string, amount: Decimal.Value) {
  const current = map.get(id)
  map.set(id, { label, amount: (current?.amount ?? new Decimal(0)).plus(amount) })
}

function breakdown(map: Map<string, { label: string, amount: Decimal }>): ReportBreakdownRow[] {
  return [...map.entries()]
    .map(([id, value]) => ({ id, label: value.label, amountEur: decimalNumber(value.amount) }))
    .sort((left, right) => right.amountEur - left.amountEur || left.label.localeCompare(right.label, 'ru'))
}

export async function globalReport(actor: Actor, query: ReportQuery): Promise<GlobalReportResponse> {
  requireRole(actor, 'administrator')

  const selectedHotel = query.scope === 'hotel'
    ? await db.query.hotels.findFirst({ where: and(eq(hotels.id, query.hotelId), eq(hotels.organizationId, actor.organizationId)) })
    : null
  if (query.scope === 'hotel' && !selectedHotel) throw createError({ statusCode: 404, statusMessage: 'Отель не найден' })

  const apartmentWhere = query.scope === 'hotel'
    ? and(eq(apartments.organizationId, actor.organizationId), eq(apartments.hotelId, query.hotelId))
    : query.scope === 'apartments'
      ? and(eq(apartments.organizationId, actor.organizationId), inArray(apartments.id, query.apartmentIds))
      : eq(apartments.organizationId, actor.organizationId)
  const apartmentRows = await db.query.apartments.findMany({
    where: apartmentWhere,
    with: { hotel: true }
  })
  if (query.scope === 'apartments' && apartmentRows.length !== query.apartmentIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'Один или несколько апартаментов не найдены' })
  }
  const apartmentMap = new Map(apartmentRows.map(apartment => [apartment.id, apartment]))
  const apartmentIds = apartmentRows.map(apartment => apartment.id)
  const activeApartmentIds = apartmentRows
    .filter(apartment => apartment.status === 'active' && apartment.hotel.status === 'active')
    .map(apartment => apartment.id)

  const [cleaningRows, taskRows, stayRows, financeRows, userRows, stockSettings, lotBalances] = await Promise.all([
    db.query.cleanings.findMany({
      where: eq(cleanings.organizationId, actor.organizationId),
      with: { assignments: { with: { cleaner: true } }, problems: true }
    }),
    db.query.tasks.findMany({ where: eq(tasks.organizationId, actor.organizationId) }),
    db.query.stays.findMany({ where: eq(stays.organizationId, actor.organizationId) }),
    db.query.financialEntries.findMany({ where: eq(financialEntries.organizationId, actor.organizationId) }),
    db.query.users.findMany({ where: eq(users.organizationId, actor.organizationId) }),
    activeApartmentIds.length
      ? db.query.apartmentConsumables.findMany({
          where: and(inArray(apartmentConsumables.apartmentId, activeApartmentIds), eq(apartmentConsumables.active, true)),
          with: { consumable: true }
        })
      : Promise.resolve([]),
    activeApartmentIds.length
      ? db.select({
          apartmentId: inventoryLots.apartmentId,
          consumableId: inventoryLots.consumableId,
          quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)`
        }).from(inventoryLots)
          .where(inArray(inventoryLots.apartmentId, activeApartmentIds))
          .groupBy(inventoryLots.apartmentId, inventoryLots.consumableId)
      : Promise.resolve([])
  ])

  const scopedCleanings = cleaningRows.filter(cleaning => apartmentMap.has(cleaning.apartmentId))
  const scopedTasks = taskRows.filter(task => apartmentMap.has(task.apartmentId))
  const scopedStays = stayRows.filter(stay => apartmentMap.has(stay.apartmentId))
  const scopedFinance = financeRows.filter(entry => apartmentMap.has(entry.apartmentId) && dateInRange(entry.occurredOn, query))
  const userNames = new Map(userRows.map(user => [user.id, user.name]))
  const balanceMap = new Map(lotBalances.map(balance => [`${balance.apartmentId}:${balance.consumableId}`, new Decimal(balance.quantity)]))

  const procurementMap = new Map<string, ProcurementRow>()
  for (const setting of stockSettings) {
    const apartment = apartmentMap.get(setting.apartmentId)
    if (!apartment) continue
    const current = balanceMap.get(`${setting.apartmentId}:${setting.consumableId}`) ?? new Decimal(0)
    const minimum = new Decimal(setting.minimumQuantity)
    const target = new Decimal(setting.targetQuantity)
    if (current.greaterThan(minimum)) continue
    const toPurchase = Decimal.max(target.minus(current), 0)
    if (toPurchase.isZero()) continue
    const detail = {
      apartmentId: apartment.id,
      apartmentName: apartment.name,
      hotelName: apartment.hotel.name,
      currentQuantity: decimalNumber(current, 3),
      minimumQuantity: setting.minimumQuantity,
      targetQuantity: setting.targetQuantity,
      toPurchase: decimalNumber(toPurchase, 3)
    }
    const currentGroup = procurementMap.get(setting.consumableId)
    if (currentGroup) {
      currentGroup.currentQuantity = decimalNumber(new Decimal(currentGroup.currentQuantity).plus(current), 3)
      currentGroup.toPurchase = decimalNumber(new Decimal(currentGroup.toPurchase).plus(toPurchase), 3)
      currentGroup.apartmentCount += 1
      currentGroup.apartments.push(detail)
    } else {
      procurementMap.set(setting.consumableId, {
        consumableId: setting.consumableId,
        name: setting.consumable.name,
        category: setting.consumable.category,
        unit: setting.consumable.unit,
        currentQuantity: decimalNumber(current, 3),
        toPurchase: decimalNumber(toPurchase, 3),
        apartmentCount: 1,
        apartments: [detail]
      })
    }
  }
  const procurement = [...procurementMap.values()]
    .map(row => ({ ...row, apartments: row.apartments.sort((a, b) => a.hotelName.localeCompare(b.hotelName, 'ru') || a.apartmentName.localeCompare(b.apartmentName, 'ru')) }))
    .sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'))

  const workloadMap = new Map<string, WorkloadDay>()
  const workloadDay = (date: string) => {
    const existing = workloadMap.get(date)
    if (existing) return existing
    const created: WorkloadDay = { date, arrivals: 0, departures: 0, cleaningCounts: {}, cleanings: [], tasks: [] }
    workloadMap.set(date, created)
    return created
  }

  for (const cleaning of scopedCleanings) {
    if (!dateInRange(cleaning.scheduledOn, query)) continue
    const apartment = apartmentMap.get(cleaning.apartmentId)!
    const day = workloadDay(cleaning.scheduledOn)
    day.cleaningCounts[cleaning.status] = (day.cleaningCounts[cleaning.status] ?? 0) + 1
    day.cleanings.push(cleaningRow(cleaning, apartment))
  }
  for (const task of scopedTasks) {
    if (!dateInRange(task.dueOn, query)) continue
    workloadDay(task.dueOn!).tasks.push(taskRow(task, apartmentMap.get(task.apartmentId)!, userNames))
  }
  for (const stay of scopedStays) {
    if (dateInRange(stay.checkInOn, query)) workloadDay(stay.checkInOn).arrivals += 1
    if (dateInRange(stay.checkOutOn, query)) workloadDay(stay.checkOutOn).departures += 1
  }

  const today = dateInSofia(new Date())!
  const overdueTasks = scopedTasks
    .filter(task => task.dueOn && task.dueOn < today && ['open', 'in_progress'].includes(task.status))
    .map(task => taskRow(task, apartmentMap.get(task.apartmentId)!, userNames))
  const undatedTasks = scopedTasks
    .filter(task => !task.dueOn && ['open', 'in_progress'].includes(task.status))
    .map(task => taskRow(task, apartmentMap.get(task.apartmentId)!, userNames))

  const byTypeMap = new Map<string, { label: string, amount: Decimal }>()
  const byHotelMap = new Map<string, { label: string, amount: Decimal }>()
  const byApartmentMap = new Map<string, { label: string, amount: Decimal }>()
  const byManagerMap = new Map<string, { label: string, amount: Decimal }>()
  let operatingExpenses = new Decimal(0)
  let guestServices = new Decimal(0)
  let cleanerPool = new Decimal(0)
  let laundry = new Decimal(0)
  let service = new Decimal(0)
  let ownerTotal = new Decimal(0)
  const cleaningMap = new Map(scopedCleanings.map(cleaning => [cleaning.id, cleaning]))
  const finance: ReportFinanceEntry[] = []

  for (const entry of scopedFinance) {
    const apartment = apartmentMap.get(entry.apartmentId)!
    const managerNames = entry.managerTeamSnapshot.map(manager => manager.name)
    const managerKey = entry.managerTeamSnapshot.map(manager => manager.id).join(',') || 'unassigned'
    const managerLabel = managerNames.join(', ') || 'Без собственников'
    if (entry.type === 'guest_service_charge') guestServices = guestServices.plus(entry.amountEur)
    else operatingExpenses = operatingExpenses.plus(entry.amountEur)
    addAmount(byTypeMap, entry.type, financeTypeLabels[entry.type] ?? entry.type, entry.amountEur)
    addAmount(byHotelMap, apartment.hotel.id, apartment.hotel.name, entry.amountEur)
    addAmount(byApartmentMap, apartment.id, apartment.name, entry.amountEur)
    addAmount(byManagerMap, managerKey, managerLabel, entry.amountEur)
    if (entry.type === 'cleaning_charge' && entry.sourceType === 'cleaning') {
      const cleaning = cleaningMap.get(entry.sourceId)
      if (cleaning) {
        cleanerPool = cleanerPool.plus(cleaning.tariffSnapshot.cleanerPoolEur)
        laundry = laundry.plus(cleaning.tariffSnapshot.laundryEur)
        service = service.plus(cleaning.tariffSnapshot.serviceEur)
        ownerTotal = ownerTotal.plus(cleaning.tariffSnapshot.ownerTotalEur)
      }
    }
    finance.push({
      id: entry.id,
      apartmentId: apartment.id,
      apartmentName: apartment.name,
      hotelName: apartment.hotel.name,
      managerNames,
      type: entry.type,
      amountEur: entry.amountEur,
      occurredOn: entry.occurredOn,
      description: entry.description,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId
    })
  }
  finance.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.apartmentName.localeCompare(b.apartmentName, 'ru'))

  const problems = scopedCleanings.filter(item => dateInRange(dateInSofia(item.completedAt), query)).reduce((count, item) => count + item.problems.length, 0)
    + scopedTasks.filter(item => item.hasProblem && dateInRange(dateInSofia(item.completedAt), query)).length
  const scheduledCleanings = scopedCleanings.filter(item => item.status !== 'canceled' && dateInRange(item.scheduledOn, query)).length

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      ...query,
      hotelName: selectedHotel?.name ?? null,
      apartments: apartmentRows
        .map(apartment => ({ id: apartment.id, name: apartment.name, hotelName: apartment.hotel.name, status: apartment.status }))
        .sort((left, right) => left.hotelName.localeCompare(right.hotelName, 'ru') || left.name.localeCompare(right.name, 'ru'))
    },
    summary: {
      scheduledCleanings,
      procurementPositions: procurement.reduce((total, row) => total + row.apartmentCount, 0),
      problems,
      operatingExpensesEur: decimalNumber(operatingExpenses)
    },
    procurement,
    workload: {
      days: [...workloadMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      overdueTasks,
      undatedTasks
    },
    finance: {
      operatingExpensesEur: decimalNumber(operatingExpenses),
      guestServicesEur: decimalNumber(guestServices),
      cleaningComponents: {
        cleanerPoolEur: decimalNumber(cleanerPool),
        laundryEur: decimalNumber(laundry),
        serviceEur: decimalNumber(service),
        ownerTotalEur: decimalNumber(ownerTotal)
      },
      byType: breakdown(byTypeMap),
      byHotel: breakdown(byHotelMap),
      byApartment: breakdown(byApartmentMap),
      byManager: breakdown(byManagerMap),
      entries: finance
    }
  }
}
