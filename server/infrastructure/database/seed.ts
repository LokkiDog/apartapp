/** Local dashboard examples. Run: npm run db:seed -- --organization=<UUID>. Existing rows are never reset. */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { and, eq, inArray, max, sql as querySql } from 'drizzle-orm'
import * as tables from './schema'
import { operationsDate, shiftOperationsDate } from '../../modules/dashboard/operations-model'

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const location = new URL(process.env.DATABASE_URL || 'postgres://aparts:aparts@localhost:55432/aparts')
  if (!['postgres:', 'postgresql:'].includes(location.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.pathname !== '/aparts') {
    throw new Error('Demo data may only be added to the local aparts database')
  }
  const organizationId = process.argv.find(arg => arg.startsWith('--organization='))?.split('=')[1]
  if (!organizationId?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    throw new Error('Pass the existing organization explicitly: --organization=<UUID>')
  }
  const { db, sql } = await import('./client')
  const now = new Date()
  const today = operationsDate(now)
  const day = (offset: number) => shiftOperationsDate(today, offset)
  const id = (key: string) => {
    const hash = createHash('sha256').update(`aparts-dashboard-demo-v1:${organizationId}:${key}`).digest('hex')
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  }
  const markerId = id('seed-receipt')
  const prefix = '[Демо]'
  try {
    const result = await db.transaction(async tx => {
      // Serialize reruns of this dataset, including concurrent invocations.
      await tx.execute(querySql`SELECT pg_advisory_xact_lock(hashtext(${`aparts-dashboard-demo:${organizationId}`}))`)
      const existing = await tx.query.auditLogs.findFirst({ where: and(eq(tables.auditLogs.id, markerId), eq(tables.auditLogs.organizationId, organizationId)) })
      if (existing) return { inserted: false, ...existing.payload }
      const organization = await tx.query.organizations.findFirst({ where: and(eq(tables.organizations.id, organizationId), eq(tables.organizations.status, 'active')) })
      if (!organization) throw new Error('Active organization not found')
      const staff = await tx.query.users.findMany({ where: and(eq(tables.users.organizationId, organizationId), eq(tables.users.status, 'active'), eq(tables.users.isSuperuser, false)), orderBy: [tables.users.name] })
      const administrator = staff.find(user => user.roles.includes('administrator'))
      const cleaners = staff.filter(user => user.roles.includes('cleaner')).slice(0, 4)
      const specialist = staff.find(user => user.roles.includes('specialist'))
      const owner = staff.find(user => user.roles.includes('manager'))
      if (!administrator || cleaners.length < 3) throw new Error('The organization needs an administrator and at least three active cleaners')

      const tariffs = [
        { ownerTotalEur: 50, cleanerPoolEur: 25, laundryEur: 10, serviceEur: 15 },
        { ownerTotalEur: 80, cleanerPoolEur: 45, laundryEur: 15, serviceEur: 20 }
      ]
      await tx.insert(tables.hotels).values([
        { id: id('hotel:0'), organizationId, name: `${prefix} Alpine Lodge`, address: 'Демонстрационный адрес, Банско', latitude: '41.835500', longitude: '23.485400' },
        { id: id('hotel:1'), organizationId, name: `${prefix} Mountain View`, address: 'Демонстрационный адрес, Банско', latitude: '41.831400', longitude: '23.478300' }
      ])
      await tx.insert(tables.apartmentTypes).values(tariffs.map((tariff, index) => ({
        id: id(`type:${index}`), organizationId, name: `${prefix} ${index ? 'Семейный' : 'Студия'}`, ...tariff,
        defaultLinenGuestCount: index ? 4 : 2, defaultChecklist: ['Убрать санузел', 'Заменить бельё', 'Проверить кухню']
      })))
      const arrivalsPerDay = [6, 4, 3, 3, 3, 2, 3]
      const arrivalOffsets = arrivalsPerDay.flatMap((amount, offset) => Array.from({ length: amount }, () => offset))
      const apartments = arrivalOffsets.map((arrivalOffset, index) => ({
        id: id(`apartment:${index}`), organizationId, hotelId: id(`hotel:${index < 12 ? 0 : 1}`), apartmentTypeId: id(`type:${index % 3 === 1 ? 1 : 0}`),
        name: `${prefix} ${index < 12 ? 'A' : 'B'}${101 + index % 12}`, capacity: index % 3 === 1 ? 4 : 2, rooms: index % 3 === 1 ? 2 : 1,
        checkInTime: '14:00', checkOutTime: '11:00', instructions: 'Демонстрационные данные для просмотра статистики.', arrivalOffset
      }))
      await tx.insert(tables.apartments).values(apartments.map(({ arrivalOffset: _, ...apartment }) => apartment))
      if (owner) await tx.insert(tables.apartmentManagers).values(apartments.map(apartment => ({ organizationId, apartmentId: apartment.id, userId: owner.id })))
      for (const [index, apartment] of apartments.entries()) {
        const arrivalOn = day(apartment.arrivalOffset)
        const departureOffset = apartment.arrivalOffset - (index % 2)
        const guestCount = apartment.capacity
        await tx.insert(tables.stays).values([
          { id: id(`stay:previous:${index}`), organizationId, apartmentId: apartment.id, checkInOn: day(departureOffset - 3), checkOutOn: day(departureOffset), adultCount: 2, childCount: 0, guestName: `${prefix} Предыдущий гость ${index + 1}`, guestComment: 'Пример для статистики выездов.', createdById: administrator.id },
          { id: id(`stay:arrival:${index}`), organizationId, apartmentId: apartment.id, checkInOn: arrivalOn, checkOutOn: day(apartment.arrivalOffset + 2), adultCount: index === 23 ? null : guestCount, childCount: index === 23 ? null : 0, source: index === 23 ? 'ical' : 'manual', guestName: index === 23 ? '' : `${prefix} Гость ${index + 1}`, guestComment: 'Пример для статистики заездов.', createdById: administrator.id }
        ])
      }
      const routeRows = await tx.select({ cleanerId: tables.cleaningAssignments.cleanerId, date: tables.cleanings.scheduledOn, position: max(tables.cleaningAssignments.routePosition) })
        .from(tables.cleaningAssignments).innerJoin(tables.cleanings, eq(tables.cleanings.id, tables.cleaningAssignments.cleaningId))
        .where(and(eq(tables.cleanings.organizationId, organizationId), inArray(tables.cleaningAssignments.cleanerId, cleaners.map(cleaner => cleaner.id))))
        .groupBy(tables.cleaningAssignments.cleanerId, tables.cleanings.scheduledOn)
      const positions = new Map(routeRows.map(row => [`${row.cleanerId}:${row.date}`, row.position ?? 0]))
      let cleaningCount = 0
      let completedCount = 0
      const cleaningByApartment = new Map<number, string>()
      async function createCleaning(key: string, apartmentIndex: number, offset: number, status: 'unassigned' | 'assigned' | 'in_progress' | 'completed', accepted: boolean, joint = false) {
        const apartment = apartments[apartmentIndex]!
        const cleaningId = id(`cleaning:${key}`)
        const tariff = tariffs[apartment.capacity === 4 ? 1 : 0]!
        const scheduledOn = day(offset)
        const completedAt = status === 'completed' ? (offset === 0 ? new Date(now.getTime() - 30 * 60_000) : new Date(`${scheduledOn}T09:30:00Z`)) : null
        const startedAt = status === 'completed' ? new Date(completedAt!.getTime() - 50 * 60_000) : status === 'in_progress' ? new Date(now.getTime() - 25 * 60_000) : null
        await tx.insert(tables.cleanings).values({
          id: cleaningId, organizationId, apartmentId: apartment.id, scheduledOn, status, tariffSnapshot: tariff,
          isUrgent: offset === apartment.arrivalOffset && apartmentIndex % 2 === 0, startedAt, completedAt,
          checklist: ['Убрать санузел', 'Заменить бельё', 'Проверить кухню'].map(label => ({ label, checked: status === 'completed' })),
          assignmentComment: `${prefix} Пример для главной и недельного графика.`, linenCollected: status === 'completed' && offset < 0
        })
        if (status !== 'unassigned') {
          const workerIndexes = joint ? [apartmentIndex % cleaners.length, (apartmentIndex + 1) % cleaners.length] : [apartmentIndex % cleaners.length]
          for (const workerIndex of workerIndexes) {
            const cleaner = cleaners[workerIndex]!
            const routeKey = `${cleaner.id}:${scheduledOn}`
            const position = (positions.get(routeKey) ?? -1) + 1
            positions.set(routeKey, position)
            await tx.insert(tables.cleaningAssignments).values({ cleaningId, cleanerId: cleaner.id, routePosition: position, assignedAt: offset < 0 ? new Date(`${day(offset - 1)}T12:00:00Z`) : new Date(now.getTime() - 3 * 60 * 60_000), acceptedAt: accepted ? (startedAt ?? new Date(now.getTime() - 60 * 60_000)) : null })
          }
        }
        if (completedAt) {
          const preparingArrival = offset === apartment.arrivalOffset
          const guests = apartmentIndex === 4 && preparingArrival ? 2 : apartment.capacity
          await tx.insert(tables.cleaningGuestPreparations).values({ cleaningId, organizationId, source: preparingArrival ? 'booking' : 'type_default', stayId: preparingArrival ? id(`stay:arrival:${apartmentIndex}`) : null, checkInOn: preparingArrival ? scheduledOn : null, adultCount: preparingArrival ? guests : null, childCount: preparingArrival ? 0 : null, guestCount: guests, capturedAt: completedAt })
          await tx.insert(tables.financialEntries).values({ id: id(`finance:cleaning:${key}`), organizationId, apartmentId: apartment.id, type: 'cleaning_charge', amountEur: tariff.ownerTotalEur, occurredOn: operationsDate(completedAt), description: `${prefix} Уборка`, sourceType: 'cleaning', sourceId: cleaningId, createdById: administrator!.id, managerTeamSnapshot: owner ? [{ id: owner.id, name: owner.name }] : [] })
          completedCount++
        }
        cleaningCount++
        return cleaningId
      }
      const workload = [8, 6, 10, 5, 11, 6, 4]
      for (let offset = 0; offset < workload.length; offset++) {
        const arrivalIndexes = apartments.flatMap((apartment, index) => apartment.arrivalOffset === offset ? [index] : [])
        const candidates = [...arrivalIndexes, ...apartments.map((_, index) => index).filter(index => !arrivalIndexes.includes(index))].slice(0, workload[offset])
        for (const [position, apartmentIndex] of candidates.entries()) {
          const status = offset === 0
            ? (['unassigned', 'assigned', 'in_progress', 'completed', 'completed', 'assigned', 'completed', 'assigned'] as const)[position]!
            : position % 4 === 0 ? 'unassigned' : 'assigned'
          const cleaningId = await createCleaning(`day:${offset}:${position}`, apartmentIndex, offset, status, status !== 'assigned' || (offset === 0 ? position === 5 : position % 3 !== 1), position === 2)
          if (offset === apartments[apartmentIndex]!.arrivalOffset) cleaningByApartment.set(apartmentIndex, cleaningId)
        }
      }
      await createCleaning('overdue:0', 18, -1, 'assigned', true)
      await createCleaning('overdue:1', 19, -2, 'unassigned', false)
      for (let index = 0; index < 10; index++) await createCleaning(`history:${index}`, index, -4 - index, 'completed', true)

      const problemExamples = [
        { index: 4, text: 'После уборки изменилось количество гостей: подготовлено на 2, ожидается 4.', origin: 'guest_count_change' },
        { index: 1, text: 'Не закрывается балконная дверь.', origin: 'manual' },
        { index: 8, text: 'Перегорела лампа в прихожей.', origin: 'manual' },
        { index: 15, text: 'Подтекает сифон под раковиной.', origin: 'manual' },
        { index: 22, text: 'Проверить подключение Wi-Fi.', origin: 'manual' }
      ]
      for (const [index, example] of problemExamples.entries()) {
        const cleaningId = cleaningByApartment.get(example.index)!
        const description = `${prefix} ${example.text}`
        await tx.insert(tables.cleaningProblems).values({ id: id(`problem:${index}`), organizationId, apartmentId: apartments[example.index]!.id, cleaningId, origin: example.origin, description, details: 'Демонстрационный пример, не реальная неисправность.', createdById: administrator.id })
        await tx.update(tables.cleanings).set({ hasProblem: true, problemDescription: description }).where(and(eq(tables.cleanings.id, cleaningId), eq(tables.cleanings.organizationId, organizationId)))
      }
      await tx.insert(tables.cleaningProblems).values([0, 1].map(index => ({ id: id(`resolved-problem:${index}`), organizationId, apartmentId: apartments[index]!.id, description: `${prefix} Устранённая проблема ${index + 1}`, createdById: administrator.id, resolvedAt: new Date(`${day(-2)}T10:00:00Z`), resolvedById: administrator.id, resolutionComment: 'Пример закрытой проблемы.' })))
      const taskExamples = [
        { title: 'Проверить замок', offset: -2, status: 'open' as const, apartment: 0 },
        { title: 'Заменить батарейки в пульте', offset: -1, status: 'in_progress' as const, apartment: 2 },
        { title: 'Проверить балконную дверь', offset: 0, status: 'resolved' as const, apartment: 1 },
        { title: 'Проверить комплект белья', offset: 0, status: 'resolved' as const, apartment: 4 },
        { title: 'Принять работу сантехника', offset: 0, status: 'resolved' as const, apartment: 15 },
        { title: 'Пополнить расходники', offset: 0, status: 'open' as const, apartment: 5 },
        { title: 'Доставить детский стул', offset: 0, status: 'open' as const, apartment: 6 },
        { title: 'Проверить Wi-Fi', offset: 0, status: 'in_progress' as const, apartment: 22 },
        { title: 'Проверить инвентарь', offset: null, status: 'open' as const, apartment: 9 },
        { title: 'Заменить лампу', offset: 1, status: 'open' as const, apartment: 8 },
        { title: 'Проверить сифон', offset: 3, status: 'open' as const, apartment: 15 },
        { title: 'Купить батарейки', offset: -5, status: 'completed' as const, apartment: 10 },
        { title: 'Отрегулировать ручку', offset: -3, status: 'completed' as const, apartment: 11 }
      ]
      for (const [index, task] of taskExamples.entries()) {
        const taskId = id(`task:${index}`)
        const assignee = index % 3 === 2 && specialist ? specialist : cleaners[index % cleaners.length]!
        const completed = task.status === 'completed'
        const amountEur = completed ? (index === 11 ? 12.5 : 25) : 0
        await tx.insert(tables.tasks).values({ id: taskId, organizationId, apartmentId: apartments[task.apartment]!.id, createdById: administrator.id, assigneeId: assignee.id, title: `${prefix} ${task.title}`, description: 'Демонстрационная задача для статистики.', status: task.status, dueOn: task.offset === null ? null : day(task.offset), priority: index < 3 ? 'high' : 'normal', ownerCostEur: amountEur, completedAt: completed ? new Date(`${day(task.offset!)}T10:00:00Z`) : null })
        if (completed) await tx.insert(tables.financialEntries).values({ id: id(`finance:task:${index}`), organizationId, apartmentId: apartments[task.apartment]!.id, type: 'task_charge', amountEur, occurredOn: day(task.offset!), description: `${prefix} ${task.title}`, sourceType: 'task', sourceId: taskId, createdById: administrator.id, managerTeamSnapshot: owner ? [{ id: owner.id, name: owner.name }] : [] })
      }
      const receipt = { organization: organization.name, date: today, hotels: 2, apartments: apartments.length, stays: apartments.length * 2, cleanings: cleaningCount, completedCleanings: completedCount, tasks: taskExamples.length, openProblems: problemExamples.length }
      await tx.insert(tables.auditLogs).values({ id: markerId, organizationId, actorId: administrator.id, action: 'demo.dashboard_seeded', entityType: 'demo_dataset', entityId: markerId, payload: receipt })
      return { inserted: true, ...receipt }
    })
    console.log(JSON.stringify(result, null, 2))
  } finally { await sql.end() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Demo seed failed'); process.exitCode = 1 })
