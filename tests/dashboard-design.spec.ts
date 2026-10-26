import { describe, expect, it } from 'vitest'
import { dashboardDesignKey, readDashboardDesign, saveDashboardDesign } from '../src/pages/dashboard/model/dashboard-design'

function storage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}
describe('dashboard design preference', () => {
  it('defaults to the new design and preserves independent dismissals and selections across reloads', () => {
    const local = storage()
    const key = dashboardDesignKey('admin', 'company')
    expect(readDashboardDesign(local, key)).toEqual({ version: 'new', dismissed: [] })
    saveDashboardDesign(local, key, { version: 'legacy', dismissed: ['new'] })
    expect(readDashboardDesign(local, key)).toEqual({ version: 'legacy', dismissed: ['new'] })
    saveDashboardDesign(local, key, { version: 'new', dismissed: ['new', 'legacy'] })
    expect(readDashboardDesign(local, key)).toEqual({ version: 'new', dismissed: ['new', 'legacy'] })
    expect(readDashboardDesign(local, dashboardDesignKey('other-admin', 'company'))).toEqual({ version: 'new', dismissed: [] })
    expect(readDashboardDesign(local, dashboardDesignKey('admin', 'other-company'))).toEqual({ version: 'new', dismissed: [] })
  })
  it('handles disabled storage, malformed values and unsupported versions', () => {
    const blocked = { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Blocked') } }
    expect(readDashboardDesign(blocked, 'key')).toEqual({ version: 'new', dismissed: [] })
    expect(() => saveDashboardDesign(blocked, 'key', { version: 'legacy', dismissed: [] })).not.toThrow()
    const local = storage()
    for (const value of ['broken', 'null', '{"version":"future"}']) {
      local.setItem('key', value)
      expect(readDashboardDesign(local, 'key')).toEqual({ version: 'new', dismissed: [] })
    }
    local.setItem('key', '{"version":"legacy","dismissed":["new",null,"future"]}')
    expect(readDashboardDesign(local, 'key')).toEqual({ version: 'legacy', dismissed: ['new'] })
  })
})
