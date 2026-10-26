type ChangeKind = 'added' | 'improved' | 'fixed'
type Release = {
  version: string
  date: string
  status: 'upcoming' | 'released'
  title: string
  groups: Array<{ kind: ChangeKind; items: string[] }>
}

// Dates identify changelog versions; these are not Git tags.
// Baseline: successful production Deploy job on 2026-10-04, commit 73b4b40.
// https://github.com/LokkiDog/apartapp/actions/runs/37187284603
// The next entry includes 78a6938, 1ea6c72 and the account/notification changes.
// On release, set its status to released and date to the actual release date.
export const changelog: Release[] = [
  {
    version: '2026.10.26', date: '2026-10-26', status: 'upcoming', title: 'accountAndWork',
    groups: [
      { kind: 'added', items: ['profile', 'security', 'notifications'] },
      { kind: 'improved', items: ['calendar', 'expenseReports', 'serviceTranslations', 'navigation'] },
      { kind: 'fixed', items: ['reload'] }
    ]
  },
  {
    version: '2026.10.04', date: '2026-10-04', status: 'released', title: 'unifiedInterface',
    groups: [{ kind: 'improved', items: ['consistentDesign', 'languages', 'liveUpdates'] }]
  }
]
