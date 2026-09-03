import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { formatEuro, getFormatLocale } from '../../../shared/lib'
import { managerExpenseCategories, managerExpenseCategoryLines, managerExpenseReportLines, managerExpenseReportTotal, type ManagerExpenseCategory, type ManagerExpenseCategoryVisibility, type ManagerExpenseLine } from '../model/manager-expense-report'

type ManagerExpensePdfReport = {
  apartmentName: string
  month: string
  lines: ManagerExpenseLine[]
  categoryVisibility: ManagerExpenseCategoryVisibility
}

const categoryLabels: Record<string, Record<ManagerExpenseCategory, string>> = {
  'ru-RU': { cleaning: 'Уборки', inventory: 'Расходники', task: 'Дополнительные работы', other: 'Прочее' },
  'en-US': { cleaning: 'Cleanings', inventory: 'Consumables', task: 'Additional work', other: 'Other' },
  'he-IL': { cleaning: 'ניקיונות', inventory: 'מוצרים מתכלים', task: 'עבודות נוספות', other: 'אחר' }
}

function formatMonth(month: string) {
  const label = new Intl.DateTimeFormat(getFormatLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  return label.slice(0, 1).toUpperCase() + label.slice(1)
}

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat(getFormatLocale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : ''
}

function safeFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 80) || 'apartament'
}

export function managerExpensePdfFileName(report: ManagerExpensePdfReport) {
  const prefix = getFormatLocale() === 'en-US' ? 'expenses' : getFormatLocale() === 'he-IL' ? 'הוצאות' : 'rashody'
  return `${prefix}-${safeFilePart(report.apartmentName)}-${report.month}.pdf`
}

export function managerExpensePdfDefinition(report: ManagerExpensePdfReport): TDocumentDefinitions {
  const locale = getFormatLocale()
  const copy = locale === 'en-US'
    ? { title: 'Expense report', name: 'Name', date: 'Date', amount: 'Amount', total: 'Monthly total', subject: 'Monthly expense report' }
    : locale === 'he-IL'
      ? { title: 'דוח הוצאות', name: 'שם', date: 'תאריך', amount: 'סכום', total: 'סה״כ חודשי', subject: 'דוח הוצאות חודשי' }
      : { title: 'Отчёт по расходам', name: 'Название', date: 'Дата', amount: 'Сумма', total: 'Итого за месяц', subject: 'Месячный отчёт по расходам' }
  const lines = managerExpenseReportLines(report.lines, report.categoryVisibility, categoryLabels[locale]?.inventory ?? categoryLabels['ru-RU']!.inventory)
  const categories = managerExpenseCategories.filter(category => report.categoryVisibility[category])
  const total = managerExpenseReportTotal(report.lines, report.categoryVisibility)

  const rtl = locale === 'he-IL'
  const content: TDocumentDefinitions['content'] = [
    { text: copy.title, style: 'title' },
    { columns: [{ text: report.apartmentName, style: 'apartment', alignment: rtl ? 'right' : 'left' }, { text: formatMonth(report.month), alignment: rtl ? 'left' : 'right', style: 'month' }], margin: [0, 0, 0, 22] }
  ]

  for (const category of categories) {
    const categoryLines = managerExpenseCategoryLines(lines, category)
    const categoryTotal = Number(categoryLines.reduce((sum, line) => sum + line.amountEur, 0).toFixed(2))
    content.push({
      stack: [
        { columns: [{ text: categoryLabels[getFormatLocale()]?.[category] ?? categoryLabels['ru-RU']![category], style: 'category' }, { text: formatEuro(categoryTotal), alignment: 'right', style: 'categoryAmount' }], margin: [0, 14, 0, 7] },
        ...(category === 'inventory' || !categoryLines.length
          ? []
          : [{
              table: {
                headerRows: 1,
                widths: category === 'cleaning' ? ['*', 72] : ['*', 92, 72],
                body: category === 'cleaning'
                  ? [
                      [{ text: copy.date, style: 'tableHeader' }, { text: copy.amount, style: ['tableHeader', 'tableAmount'] }],
                      ...categoryLines.map(line => [
                        { text: formatDate(line.occurredOn), style: 'tableText' },
                        { text: formatEuro(line.amountEur), style: 'tableAmount' }
                      ])
                    ]
                  : [
                      [{ text: copy.name, style: 'tableHeader' }, { text: copy.date, style: 'tableHeader' }, { text: copy.amount, style: ['tableHeader', 'tableAmount'] }],
                      ...categoryLines.map(line => [
                        { text: line.description, style: 'tableText' },
                        { text: formatDate(line.occurredOn), style: 'tableDate' },
                        { text: formatEuro(line.amountEur), style: 'tableAmount' }
                      ])
                    ]
              },
              layout: {
                hLineWidth: (index: number) => index === 0 ? 0 : 0.5,
                vLineWidth: () => 0,
                hLineColor: () => '#DCE6E0',
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 7,
                paddingBottom: () => 7
              }
            }])
      ],
      unbreakable: categoryLines.length <= 3
    })
  }

  content.push({
    columns: [{ text: copy.total, style: 'totalLabel' }, { text: formatEuro(total), alignment: 'right', style: 'totalAmount' }],
    margin: [0, 24, 0, 0]
  })

  return {
    pageSize: 'A4',
    pageMargins: [42, 46, 42, 46],
    info: { title: `${copy.title} · ${report.apartmentName} · ${report.month}`, author: 'Aparts CRM', subject: copy.subject },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#173326', alignment: rtl ? 'right' : 'left' },
    styles: {
      title: { fontSize: 21, bold: true, color: '#173326', margin: [0, 0, 0, 7] },
      apartment: { fontSize: 12, bold: true, color: '#173326' },
      month: { fontSize: 10, color: '#5E7569' },
      category: { fontSize: 12, bold: true, color: '#173326' },
      categoryAmount: { fontSize: 12, bold: true, color: '#173326' },
      tableHeader: { fontSize: 8, bold: true, color: '#5E7569' },
      tableText: { color: '#2C4A3A' },
      tableDate: { color: '#5E7569', alignment: 'right' },
      tableAmount: { bold: true, alignment: 'right' },
      totalLabel: { fontSize: 12, bold: true, color: '#173326', fillColor: '#E8F7EF', margin: [10, 10, 0, 10] },
      totalAmount: { fontSize: 16, bold: true, color: '#173326', fillColor: '#E8F7EF', margin: [0, 8, 10, 8] }
    },
    content
  }
}

export async function downloadManagerExpensePdf(report: ManagerExpensePdfReport) {
  if (!import.meta.client) return

  const [{ default: pdfMake }, { default: virtualFileSystem }] = await Promise.all([
    import('pdfmake/build/pdfmake.js'),
    import('pdfmake/build/vfs_fonts.js')
  ])
  pdfMake.addVirtualFileSystem(virtualFileSystem)
  await pdfMake.createPdf(managerExpensePdfDefinition(report)).download(managerExpensePdfFileName(report))
}
