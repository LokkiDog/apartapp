import { changelog, latestReleaseAnnouncement, hasSeenRelease } from '#shared/config/changelog'
import type { ReleaseAnnouncementState } from '@contracts/release-announcements'
import { useCurrentUser } from '#fsd/shared/auth'

type AccountState = ReleaseAnnouncementState & { ownerId: string }
export function useReleaseAnnouncement() {
  const user = useCurrentUser()
  const { t } = useI18n()
  const toast = useToast()
  const state = useState<AccountState | null>('release-announcement-state', () => null)
  const dismissed = useState<{ ownerId: string; version: string } | null>('release-announcement-dismissed', () => null)
  const pendingOwner = useState<string | null>('release-announcement-pending', () => null)
  const open = useState('release-announcement-open', () => false)
  const displayedVersion = useState<string | null>('release-announcement-version', () => null)
  const previewMode = useState('release-announcement-preview', () => false)
  const latest = computed(() => latestReleaseAnnouncement())
  const displayed = computed(() => changelog.find(release => release.version === displayedVersion.value) ?? null)
  const unread = computed(() => Boolean(latest.value && user.value && state.value?.ownerId === user.value.id && state.value.version === latest.value.version && !state.value.seen && !(dismissed.value?.ownerId === user.value.id && hasSeenRelease(dismissed.value.version, latest.value.version))))
  async function refresh() {
    const ownerId = user.value?.id
    if (!import.meta.client || !ownerId || pendingOwner.value === ownerId) return
    pendingOwner.value = ownerId
    try {
      const result = await $fetch<ReleaseAnnouncementState>('/api/users/me/release-announcement')
      if (user.value?.id === ownerId) { state.value = { ...result, ownerId }; return true }
    } catch { /* An optional announcement must not prevent work when offline. */ }
    finally { if (pendingOwner.value === ownerId) pendingOwner.value = null }
  }
  async function markSeen(version: string) {
    const ownerId = user.value?.id
    if (!ownerId || latest.value?.version !== version) return
    if (dismissed.value?.ownerId === ownerId && hasSeenRelease(dismissed.value.version, version)) return
    dismissed.value = { ownerId, version }
    try {
      const result = await $fetch<ReleaseAnnouncementState>('/api/users/me/release-announcement', { method: 'POST', body: { version }, retry: false })
      if (user.value?.id === ownerId) state.value = { ...result, ownerId }
    } catch {
      if (user.value?.id === ownerId) toast.add({ title: t('releaseAnnouncement.saveError'), color: 'warning' })
    }
  }
  async function markLatestSeen() { if (latest.value) await markSeen(latest.value.version) }
  function preview(version: string) {
    if (!changelog.some(release => release.version === version && release.announcement?.enabled)) return
    displayedVersion.value = version; previewMode.value = true; open.value = true
  }
  function showLatest() {
    if (!unread.value || !latest.value) return
    displayedVersion.value = latest.value.version; previewMode.value = false; open.value = true
  }
  function reset() { state.value = null; dismissed.value = null; pendingOwner.value = null; open.value = false; displayedVersion.value = null; previewMode.value = false }
  return { open, displayed, previewMode, unread, refresh, markSeen, markLatestSeen, preview, showLatest, reset }
}
