import type { GlobalReportResponse } from '@contracts/report'

export type ReportTab = 'summary' | 'procurement' | 'workload' | 'finance'

const labels: Record<ReportTab, string> = {
  summary: 'svodka',
  procurement: 'zakupki',
  workload: 'nagruzka',
  finance: 'finansy'
}

const financeTypeLabels: Record<string, string> = {
  cleaning_charge: 'Уборки',
  inventory_charge: 'Расходники',
  task_charge: 'Работы',
  guest_service_charge: 'Дополнительные услуги',
  compensation: 'Корректировки'
}

function scopeLabel(report: GlobalReportResponse) {
  if (report.filters.scope === 'all') return 'Все объекты'
  if (report.filters.scope === 'hotel') return report.filters.hotelName ?? 'Отель'
  return report.filters.apartments.map(apartment => `${apartment.hotelName} · ${apartment.name}`).join(', ')
}

function cell(value: string | number) {
  const normalized = typeof value === 'number' ? String(value).replace('.', ',') : String(value)
  return `"${normalized.replaceAll('"', '""')}"`
}

function csv(rows: Array<Array<string | number>>) {
  return `\uFEFF${rows.map(row => row.map(cell).join(';')).join('\n')}`
}

export function downloadReportCsv(report: GlobalReportResponse, tab: ReportTab) {
  let rows: Array<Array<string | number>>
  if (tab === 'summary') {
    rows = [
      ['Период', 'Область', 'Выбранные объекты', 'Уборок', 'Позиций к закупке', 'Проблем', 'Операционные расходы, EUR'],
      [`${report.filters.from} — ${report.filters.to}`, report.filters.scope === 'hotel' ? 'Отель' : report.filters.scope === 'apartments' ? 'Апартаменты' : 'Все объекты', scopeLabel(report), report.summary.scheduledCleanings, report.summary.procurementPositions, report.summary.problems, report.summary.operatingExpensesEur]
    ]
  } else if (tab === 'procurement') {
    rows = [['Категория', 'Расходник', 'Единица', 'Отель', 'Апартамент', 'Сейчас', 'Порог', 'Цель', 'Докупить']]
    for (const item of report.procurement) {
      for (const apartment of item.apartments) rows.push([item.category, item.name, item.unit, apartment.hotelName, apartment.apartmentName, apartment.currentQuantity, apartment.minimumQuantity, apartment.targetQuantity, apartment.toPurchase])
    }
  } else if (tab === 'workload') {
    rows = [['Дата', 'Тип', 'Отель', 'Апартамент', 'Состояние', 'Исполнитель']]
    for (const day of report.workload.days) {
      for (const item of day.cleanings) rows.push([day.date, 'Уборка', item.hotelName, item.apartmentName, item.status, item.cleaners.join(', ') || 'Не назначен'])
      for (const item of day.tasks) rows.push([day.date, item.title, item.hotelName, item.apartmentName, item.status, item.assigneeName ?? 'Не назначен'])
      if (day.arrivals) rows.push([day.date, `Заезды: ${day.arrivals}`, '', '', '', ''])
      if (day.departures) rows.push([day.date, `Выезды: ${day.departures}`, '', '', '', ''])
    }
  } else {
    rows = [['Дата', 'Категория', 'Отель', 'Апартамент', 'Управляющие', 'Описание', 'Сумма, EUR']]
    for (const item of report.finance.entries) rows.push([item.occurredOn, financeTypeLabels[item.type] ?? item.type, item.hotelName, item.apartmentName, item.managerNames.join(', ') || 'Без управляющих', item.description, item.amountEur])
  }

  const blob = new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `aparts-${labels[tab]}-${report.filters.from}-${report.filters.to}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
