import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findApartments, findReports, managedApartmentIds } = vi.hoisted(() => ({
  findApartments: vi.fn(),
  findReports: vi.fn(),
  managedApartmentIds: vi.fn()
}))

vi.mock('../server/infrastructure/database/client', () => ({
  db: {
    query: {
      apartments: { findMany: findApartments },
      managerExpenseReports: { findFirst: findReports }
    }
  }
}))

vi.mock('../server/infrastructure/auth/actor', () => ({
  canManageApartment: vi.fn(),
  managedApartmentIds,
  requireRole: vi.fn()
}))

import { listManagerExpenseReports } from '../server/modules/finance/finance.service'

const apartments = [
  {
    id: 'apartment-1',
    name: 'Длинное название апартамента',
    hotel: { name: 'Апарт-отель «Пирин»' },
    managerAssignments: [{ manager: { id: 'owner-2', name: 'Борис' } }, { manager: { id: 'owner-1', name: 'Анна' } }]
  },
  {
    id: 'apartment-2',
    name: 'Без собственника',
    hotel: { name: 'Апарт-отель «Рила»' },
    managerAssignments: []
  }
]

const publishedReport = { publishedAt: new Date('2026-09-01T00:00:00.000Z'), lines: [], cleaningEnabled: true, inventoryEnabled: true, taskEnabled: true, otherEnabled: true }
const draftReport = { ...publishedReport, publishedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  managedApartmentIds.mockResolvedValue(null)
  findApartments.mockResolvedValue(apartments)
  findReports.mockImplementation(async () => {
    return findReports.mock.calls.length === 1 ? publishedReport : draftReport
  })
})

describe('listManagerExpenseReports', () => {
  it('returns hotel, apartment and sorted owner names for an administrator', async () => {
    const reports = await listManagerExpenseReports({ id: 'admin', organizationId: 'organization-1', roles: ['administrator'] } as any, '2026-09')

    expect(reports).toEqual([
      expect.objectContaining({ apartmentId: 'apartment-1', hotelName: 'Апарт-отель «Пирин»', apartmentName: 'Длинное название апартамента', managerNames: ['Анна', 'Борис'] }),
      expect.objectContaining({ apartmentId: 'apartment-2', hotelName: 'Апарт-отель «Рила»', apartmentName: 'Без собственника', managerNames: [] })
    ])
    expect(findApartments).toHaveBeenCalledWith(expect.objectContaining({
      with: expect.objectContaining({ hotel: { columns: { name: true } } })
    }))
  })

  it('keeps a manager limited to published reports', async () => {
    const reports = await listManagerExpenseReports({ id: 'manager', organizationId: 'organization-1', roles: ['manager'] } as any, '2026-09')

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ apartmentId: 'apartment-1', hotelName: 'Апарт-отель «Пирин»' })
  })
})
