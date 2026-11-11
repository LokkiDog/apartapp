import { expect, it, vi } from 'vitest'
import type { GlobalReportResponse } from '@contracts/report'
import { downloadReportCsv } from '../src/pages/reports/lib/report-csv'

const report: GlobalReportResponse = {
  generatedAt: '2026-08-31T00:00:00Z',
  filters: { scope: 'all', from: '2026-08-01', to: '2026-08-31', hotelName: null, apartments: [] },
  summary: { scheduledCleanings: 0, procurementPositions: 0, problems: 0, operatingExpensesEur: -12.5 },
  procurement: [],
  workload: { days: [], overdueTasks: [], undatedTasks: [] },
  finance: {
    operatingExpensesEur: -12.5,
    guestServicesEur: 0,
    cleaningComponents: { cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0, ownerTotalEur: 0 },
    byType: [], byHotel: [], byApartment: [], byManager: [],
    entries: [{
      id: 'cash', apartmentId: 'a', apartmentName: 'A', hotelName: 'Hotel', managerNames: [],
      type: 'cash_receipt', amountEur: -12.5, occurredOn: '2026-08-02', description: 'Cash', sourceType: 'task', sourceId: 'cash'
    }]
  }
}

it.each([
  ['summary', 'Операционные расходы, RUB'],
  ['finance', 'Сумма, RUB']
] as const)('uses the selected code in the %s CSV heading and keeps the numeric cell', async (tab, heading) => {
  const makeUrl = vi.spyOn(URL, 'createObjectURL')
  vi.stubGlobal('document', { createElement: () => ({ click() {} }) })
  try {
    downloadReportCsv(report, tab, 'ru', 'RUB')
    const blob = makeUrl.mock.calls[0]![0] as Blob
    const [headers, values] = (await blob.text()).split('\n')
    expect(headers).toContain(`"${heading}"`)
    expect(values).toMatch(/;"-12,5"$/)
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
