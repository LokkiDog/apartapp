export type DashboardDesign = 'new' | 'legacy'
export type DashboardDesignPreference = { version: DashboardDesign; dismissed: DashboardDesign[] }
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
const initial = (): DashboardDesignPreference => ({ version: 'new', dismissed: [] })
export function dashboardDesignKey(userId: string, organizationId: string) {
  return `aparts.dashboard.design:${organizationId}:${userId}`
}
export function readDashboardDesign(storage: Pick<PreferenceStorage, 'getItem'>, key: string): DashboardDesignPreference {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null')
    if (!value || !['new', 'legacy'].includes(value.version)) return initial()
    return { version: value.version, dismissed: Array.isArray(value.dismissed) ? value.dismissed.filter((v: unknown) => v === 'new' || v === 'legacy') : [] }
  } catch { return initial() }
}
export function saveDashboardDesign(storage: Pick<PreferenceStorage, 'setItem'>, key: string, value: DashboardDesignPreference) {
  try { storage.setItem(key, JSON.stringify(value)) } catch { /* The component retains its in-memory preference. */ }
}
