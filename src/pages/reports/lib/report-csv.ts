import type { GlobalReportResponse } from '@contracts/report'

export type ReportTab = 'summary' | 'procurement' | 'workload' | 'finance'
type CsvLocale = 'ru' | 'en' | 'he'

const labels: Record<ReportTab, string> = {
  summary: 'svodka',
  procurement: 'zakupki',
  workload: 'nagruzka',
  finance: 'finansy'
}

const financeTypeLabels: Record<CsvLocale, Record<string, string>> = {
  ru: { cleaning_charge: 'Уборки', inventory_charge: 'Расходники', task_charge: 'Работы', guest_service_charge: 'Дополнительные услуги', compensation: 'Корректировки', manual_expense: 'Прочее' },
  en: { cleaning_charge: 'Cleanings', inventory_charge: 'Consumables', task_charge: 'Work', guest_service_charge: 'Extra services', compensation: 'Adjustments', manual_expense: 'Other' },
  he: { cleaning_charge: 'ניקיונות', inventory_charge: 'חומרים מתכלים', task_charge: 'עבודות', guest_service_charge: 'שירותים נוספים', compensation: 'התאמות', manual_expense: 'אחר' }
}

function scopeLabel(report: GlobalReportResponse, locale: CsvLocale) {
  const labels = { ru: { all: 'Все объекты', hotel: 'Отель' }, en: { all: 'All properties', hotel: 'Hotel' }, he: { all: 'כל הנכסים', hotel: 'מלון' } }[locale]
  if (report.filters.scope === 'all') return labels.all
  if (report.filters.scope === 'hotel') return report.filters.hotelName ?? labels.hotel
  return report.filters.apartments.map(apartment => `${apartment.hotelName} · ${apartment.name}`).join(', ')
}

function cell(value: string | number) {
  const normalized = typeof value === 'number' ? String(value).replace('.', ',') : String(value)
  return `"${normalized.replaceAll('"', '""')}"`
}

function csv(rows: Array<Array<string | number>>) {
  return `\uFEFF${rows.map(row => row.map(cell).join(';')).join('\n')}`
}

export function downloadReportCsv(report: GlobalReportResponse, tab: ReportTab, locale: CsvLocale = 'ru') {
  const l = locale === 'en' ? { period: 'Period', scope: 'Scope', selected: 'Selected properties', cleanings: 'Cleanings', procurement: 'Procurement items', problems: 'Problems', expenses: 'Operating expenses, EUR', category: 'Category', consumable: 'Consumable', unit: 'Unit', hotel: 'Hotel', apartment: 'Apartment', current: 'Current', threshold: 'Threshold', target: 'Target', buy: 'To buy', date: 'Date', type: 'Type', status: 'Status', assignee: 'Assignee', financeCategory: 'Category', managers: 'Owners', description: 'Description', amount: 'Amount, EUR', all: 'All properties', propertyHotel: 'Hotel', apartments: 'Apartments', cleaning: 'Cleaning', unassigned: 'Unassigned', arrivals: 'Arrivals', departures: 'Departures' } : locale === 'he' ? { period: 'תקופה', scope: 'תחום', selected: 'נכסים נבחרים', cleanings: 'ניקיונות', procurement: 'פריטי רכש', problems: 'בעיות', expenses: 'הוצאות תפעול, EUR', category: 'קטגוריה', consumable: 'חומר מתכלה', unit: 'יחידה', hotel: 'מלון', apartment: 'דירה', current: 'נוכחי', threshold: 'סף', target: 'יעד', buy: 'לקנייה', date: 'תאריך', type: 'סוג', status: 'מצב', assignee: 'מבצע', financeCategory: 'קטגוריה', managers: 'בעלים', description: 'תיאור', amount: 'סכום, EUR', all: 'כל הנכסים', propertyHotel: 'מלון', apartments: 'דירות', cleaning: 'ניקיון', unassigned: 'לא הוקצה', arrivals: 'הגעות', departures: 'עזיבות' } : { period: 'Период', scope: 'Область', selected: 'Выбранные объекты', cleanings: 'Уборок', procurement: 'Позиций к закупке', problems: 'Проблем', expenses: 'Операционные расходы, EUR', category: 'Категория', consumable: 'Расходник', unit: 'Единица', hotel: 'Отель', apartment: 'Апартамент', current: 'Сейчас', threshold: 'Порог', target: 'Цель', buy: 'Докупить', date: 'Дата', type: 'Тип', status: 'Состояние', assignee: 'Исполнитель', financeCategory: 'Категория', managers: 'Собственники', description: 'Описание', amount: 'Сумма, EUR', all: 'Все объекты', propertyHotel: 'Отель', apartments: 'Апартаменты', cleaning: 'Уборка', unassigned: 'Не назначен', arrivals: 'Заезды', departures: 'Выезды' }
  let rows: Array<Array<string | number>>
  if (tab === 'summary') {
    rows = [
      [l.period, l.scope, l.selected, l.cleanings, l.procurement, l.problems, l.expenses],
      [`${report.filters.from} — ${report.filters.to}`, report.filters.scope === 'hotel' ? l.hotel : report.filters.scope === 'apartments' ? l.apartments : l.all, scopeLabel(report, locale), report.summary.scheduledCleanings, report.summary.procurementPositions, report.summary.problems, report.summary.operatingExpensesEur]
    ]
  } else if (tab === 'procurement') {
    rows = [[l.category, l.consumable, l.unit, l.hotel, l.apartment, l.current, l.threshold, l.target, l.buy]]
    for (const item of report.procurement) {
      for (const apartment of item.apartments) rows.push([item.category, item.name, item.unit, apartment.hotelName, apartment.apartmentName, apartment.currentQuantity, apartment.minimumQuantity, apartment.targetQuantity, apartment.toPurchase])
    }
  } else if (tab === 'workload') {
    rows = [[l.date, l.type, l.hotel, l.apartment, l.status, l.assignee]]
    for (const day of report.workload.days) {
      for (const item of day.cleanings) rows.push([day.date, l.cleaning, item.hotelName, item.apartmentName, item.status, item.cleaners.join(', ') || l.unassigned])
      for (const item of day.tasks) rows.push([day.date, item.title, item.hotelName, item.apartmentName, item.status, item.assigneeName ?? l.unassigned])
      if (day.arrivals) rows.push([day.date, `${l.arrivals}: ${day.arrivals}`, '', '', '', ''])
      if (day.departures) rows.push([day.date, `${l.departures}: ${day.departures}`, '', '', '', ''])
    }
  } else {
    rows = [[l.date, l.financeCategory, l.hotel, l.apartment, l.managers, l.description, l.amount]]
    for (const item of report.finance.entries) rows.push([item.occurredOn, financeTypeLabels[locale][item.type] ?? item.type, item.hotelName, item.apartmentName, item.managerNames.join(', ') || l.unassigned, item.description, item.amountEur])
  }

  const blob = new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `aparts-${labels[tab]}-${report.filters.from}-${report.filters.to}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
