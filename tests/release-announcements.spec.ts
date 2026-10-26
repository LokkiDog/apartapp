import { describe, expect, it } from 'vitest'
import { latestReleaseAnnouncement, hasSeenRelease, releaseAnchor, type Release } from '../shared/config/changelog'
import { releaseSeenSchema } from '../shared/contracts/release-announcements'
import { canShowAnnouncement } from '../src/features/release-announcement/model/announcement-policy'

const release = (version: string, status: Release['status'] = 'released', enabled = true): Release => ({
  version, date: version.replaceAll('.', '-'), status, title: 'example', groups: [], announcement: { enabled, image: '/cover.jpg', highlights: [] }
})
describe('release announcements', () => {
  it('selects only the newest published announcement and skips drafts and minor updates', () => {
    expect(latestReleaseAnnouncement([release('2026.10.26', 'upcoming'), release('2026.10.04'), release('2026.10.20', 'released', false), release('2026.09.01')])?.version).toBe('2026.10.04')
    expect(latestReleaseAnnouncement([release('2026.10.26', 'upcoming')])).toBeNull()
    expect(latestReleaseAnnouncement([release('2026.09.01'), release('2026.10.04')])?.version).toBe('2026.10.04')
  })
  it('does not reshow older releases after a rollback and produces safe direct links', () => {
    expect(hasSeenRelease(null, '2026.10.26')).toBe(false)
    expect(hasSeenRelease('2026.10.04', '2026.10.26')).toBe(false)
    expect(hasSeenRelease('2026.10.26', '2026.10.26')).toBe(true)
    expect(hasSeenRelease('2026.11.01', '2026.10.26')).toBe(true)
    expect(releaseAnchor('2026.10.26')).toBe('release-2026-10-26')
    expect(releaseSeenSchema.safeParse({ version: '2026.10.26', userId: 'foreign' }).success).toBe(false)
  })
  it('waits for the home screen, an idle page and the absence of overlays or unfinished work', () => {
    const ready = { unread: true, onHome: true, loading: false, overlayOpen: false, editing: false, dirtyForm: false, visible: true }
    expect(canShowAnnouncement(ready)).toBe(true)
    for (const blocker of ['loading', 'overlayOpen', 'editing', 'dirtyForm'] as const) expect(canShowAnnouncement({ ...ready, [blocker]: true })).toBe(false)
    for (const required of ['unread', 'onHome', 'visible'] as const) expect(canShowAnnouncement({ ...ready, [required]: false })).toBe(false)
  })
})
