import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { notificationListQuerySchema, workListQuerySchema } from '../shared/contracts/crm'

describe('page loading performance contracts', () => {
  it('loads locale catalogs lazily and keeps oversized export chunks out of the PWA precache', () => {
    const i18n = readFileSync('i18n/i18n.config.ts', 'utf8')
    const nuxt = readFileSync('nuxt.config.ts', 'utf8')
    const pdf = readFileSync('src/pages/statement/lib/manager-expense-pdf.ts', 'utf8')

    expect(i18n).not.toContain("from './locales/")
    expect(i18n).not.toContain('messages:')
    expect(nuxt).toContain("file: 'ru.json'")
    expect(nuxt).toContain("file: 'en.json'")
    expect(nuxt).toContain("file: 'he.json'")
    expect(nuxt).toContain("chunk.name === 'pdfmake' || chunk.name === 'vfs_fonts'")
    expect(nuxt).toContain("globIgnores: ['**/pdfmake*.js', '**/vfs_fonts*.js']")
    expect(nuxt).toContain('maximumFileSizeToCacheInBytes: 1024 * 1024')
    expect(pdf).toContain("import('pdfmake/build/pdfmake.js')")
    expect(pdf).toContain("import('pdfmake/build/vfs_fonts.js')")
    expect(pdf).not.toMatch(/^import (?!type).*from ['"]pdfmake/m)
  })

  it('loads independent page resources concurrently and defers closed heavy panels', () => {
    const calendar = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const work = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    const hotels = readFileSync('src/pages/hotels/HotelsPage.vue', 'utf8')
    const inventory = readFileSync('src/pages/inventory/InventoryPage.vue', 'utf8')
    const reports = readFileSync('src/pages/reports/ReportsPage.vue', 'utf8')

    for (const page of [calendar, work, hotels, inventory, reports]) expect(page).toContain('Promise.all([')
    expect(calendar).toContain("defineAsyncComponent(() => import('./StayDetailsSlideover.vue'))")
    expect(work).toContain('const LazyCleaningFormSlideover = defineAsyncComponent')
    expect(hotels).toContain('const LazyHotelLocationPicker = defineAsyncComponent')
  })

  it('keeps operational work small and pages history with validated cursors', () => {
    expect(workListQuerySchema.parse({ view: 'operational' })).toEqual({ view: 'operational', limit: 50 })
    expect(workListQuerySchema.parse({ view: 'history', cursor: 'cursor', limit: '25' })).toEqual({ view: 'history', cursor: 'cursor', limit: 25 })
    expect(() => workListQuerySchema.parse({ view: 'history', limit: 101 })).toThrow()

    const work = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    const cleanings = readFileSync('server/modules/cleaning/cleaning.service.ts', 'utf8')
    const tasks = readFileSync('server/modules/task/task.service.ts', 'utf8')
    expect(work).toContain('{ query: { view: "operational" } }')
    expect(cleanings).toContain("query.view === 'history' ? query.limit + 1")
    expect(tasks).toContain("query.view === 'history' ? query.limit + 1")
  })

  it('pages notifications without changing the legacy array response', () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ paginated: false, limit: 30 })
    expect(notificationListQuerySchema.parse({ paginated: 'true', limit: '10' })).toEqual({ paginated: true, limit: 10 })

    const endpoint = readFileSync('server/api/notifications/index.get.ts', 'utf8')
    expect(endpoint).toContain('if (!query.paginated) return items')
    expect(endpoint).toContain('limit: query.paginated ? query.limit + 1 : undefined')
  })

  it('serves the dashboard from a compact endpoint and adds list indexes', () => {
    const dashboard = readFileSync('src/pages/dashboard/DashboardPage.vue', 'utf8')
    const schema = readFileSync('server/infrastructure/database/schema.ts', 'utf8')
    const migration = readFileSync('server/infrastructure/database/migrations/0038_list_performance_indexes.sql', 'utf8')

    expect(dashboard).toContain("$fetch<DashboardResponse>('/api/dashboard'")
    expect(dashboard).not.toContain("$fetch<Stay[]>('/api/stays')")
    for (const indexName of [
      'cleaning_operational_list_idx',
      'task_operational_list_idx',
      'task_assignee_operational_list_idx',
      'notification_user_created_idx'
    ]) {
      expect(schema).toContain(indexName)
      expect(migration).toContain(indexName)
    }
  })

  it('configures compressed immutable Nuxt assets without upgrading ordinary requests', () => {
    const nginx = readFileSync('deploy/nginx/aparts.conf', 'utf8')
    expect(nginx).toContain('gzip on;')
    expect(nginx).toContain('location ^~ /_nuxt/')
    expect(nginx).toContain('Cache-Control "public, max-age=31536000, immutable"')
    expect(nginx).toContain('location = /api/notifications/ws')
    expect(nginx).toContain('proxy_set_header Connection "";')
  })
})
