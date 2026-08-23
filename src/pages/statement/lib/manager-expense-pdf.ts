import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { formatEuro } from '../../../shared/lib'
import { managerExpenseCategories, managerExpenseReportLines, managerExpenseReportTotal, type ManagerExpenseCategory, type ManagerExpenseCategoryVisibility, type ManagerExpenseLine } from '../model/manager-expense-report'

type ManagerExpensePdfReport = {
  apartmentName: string
  month: string
  lines: ManagerExpenseLine[]
  categoryVisibility: ManagerExpenseCategoryVisibility
}

const categoryLabels: Record<ManagerExpenseCategory, string> = {
  cleaning: 'Уборки',
  inventory: 'Расходники',
  task: 'Дополнительные работы'
}

function formatMonth(month: string) {
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  return label.slice(0, 1).toUpperCase() + label.slice(1)
}

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : ''
}

function safeFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 80) || 'apartament'
}

export function managerExpensePdfFileName(report: ManagerExpensePdfReport) {
  return `rashody-${safeFilePart(report.apartmentName)}-${report.month}.pdf`
}

export function managerExpensePdfDefinition(report: ManagerExpensePdfReport): TDocumentDefinitions {
  const lines = managerExpenseReportLines(report.lines, report.categoryVisibility)
  const categories = managerExpenseCategories.filter(category => report.categoryVisibility[category])
  const total = managerExpenseReportTotal(report.lines, report.categoryVisibility)

  const content: TDocumentDefinitions['content'] = [
    { text: 'Отчёт по расходам', style: 'title' },
    { columns: [{ text: report.apartmentName, style: 'apartment' }, { text: formatMonth(report.month), alignment: 'right', style: 'month' }], margin: [0, 0, 0, 22] }
  ]

  for (const category of categories) {
    const categoryLines = lines.filter(line => line.category === category)
    const categoryTotal = Number(categoryLines.reduce((sum, line) => sum + line.amountEur, 0).toFixed(2))
    content.push({
      stack: [
        { columns: [{ text: categoryLabels[category], style: 'category' }, { text: formatEuro(categoryTotal), alignment: 'right', style: 'categoryAmount' }], margin: [0, 14, 0, 7] },
        ...(category === 'inventory' || !categoryLines.length
          ? []
          : [{
              table: {
                headerRows: 1,
                widths: ['*', 92, 72],
                body: [
                  [{ text: 'Название', style: 'tableHeader' }, { text: 'Дата', style: 'tableHeader' }, { text: 'Сумма', style: ['tableHeader', 'tableAmount'] }],
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
    columns: [{ text: 'Итого за месяц', style: 'totalLabel' }, { text: formatEuro(total), alignment: 'right', style: 'totalAmount' }],
    margin: [0, 24, 0, 0]
  })

  return {
    pageSize: 'A4',
    pageMargins: [42, 46, 42, 46],
    info: { title: `Расходы · ${report.apartmentName} · ${report.month}`, author: 'Aparts CRM', subject: 'Месячный отчёт по расходам' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#173326' },
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
