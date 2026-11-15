import { canAccessWorkSection, usesManagerOnlyNavigation, type SessionUser } from './session'

export type NavItem = { to: string; label: string; icon: string }
type NavigationGroup = { label: string; items: NavItem[] }
type NavigationUser = Pick<SessionUser, 'roles' | 'guestsEnabled' | 'messagingEnabled'>

export function getCrmNavigation(user: NavigationUser | null | undefined, t: (key: string) => string) {
  const isAdministrator = user?.roles.includes('administrator') ?? false
  const isSpecialistNavigation = Boolean(user?.roles.includes('specialist') && !isAdministrator)
  const work = [
    { to: '/', label: t('nav.home'), icon: 'i-lucide-layout-dashboard' },
    { to: '/calendar', label: t('nav.bookings'), icon: 'i-lucide-calendar-days' },
    { to: '/work', label: t('nav.cleanings'), icon: 'i-lucide-broom' },
  ]
  const specialistWork = [
    { to: '/work', label: t('nav.cleanings'), icon: 'i-lucide-broom' },
    { to: '/tasks', label: t('work.tasks'), icon: 'i-lucide-clipboard-check' },
  ]
  const expenses = {
    to: '/expenses',
    label: t('nav.expenses'),
    icon: 'i-lucide-receipt',
  }
  const problems = {
    to: '/problems',
    label: t('nav.problems'),
    icon: 'i-lucide-triangle-alert',
  }
  const objects = [
    {
      to: '/apartments',
      label: t('nav.apartments'),
      icon: 'i-lucide-building-2',
    },
    { to: '/hotels', label: t('nav.hotels'), icon: 'i-lucide-hotel' },
    { to: '/inventory', label: t('nav.inventory'), icon: 'i-lucide-package' },
  ]
  const reports = [
    {
      to: '/reports',
      label: t('nav.summary'),
      icon: 'i-lucide-chart-no-axes-combined',
    },
    {
      to: '/statement',
      label: t('nav.statement'),
      icon: 'i-lucide-wallet-cards',
    },
  ]
  const managerFinance = [
    {
      to: '/statement',
      label: t('nav.myExpenses'),
      icon: 'i-lucide-wallet-cards',
    },
  ]
  const managerPrimary = [
    { to: '/calendar', label: t('nav.bookings'), icon: 'i-lucide-calendar-days' },
    {
      to: '/apartments',
      label: t('nav.apartments'),
      icon: 'i-lucide-building-2',
    },
    ...managerFinance,
  ]
  const communicationItems = [
    ...(user?.guestsEnabled
      ? [{ to: '/guests', label: t('guests.title'), icon: 'i-lucide-contact' }]
      : []),
    ...(user?.messagingEnabled
      ? [{ to: '/messages', label: t('messaging.title'), icon: 'i-lucide-messages-square' }]
      : []),
  ]
  const settings = [
    ...(user?.messagingEnabled ? [{ to: '/settings/messaging', label: t('messaging.settings'), icon: 'i-lucide-messages-square' }] : []),
    { to: '/settings/site', label: t('siteSettings.title'), icon: 'i-lucide-globe' },
    { to: '/settings/users', label: t('nav.users'), icon: 'i-lucide-users' },
    {
      to: '/settings/apartment-types',
      label: t('nav.apartmentTypes'),
      icon: 'i-lucide-coins',
    },
    {
      to: '/settings/services',
      label: t('nav.services'),
      icon: 'i-lucide-concierge-bell',
    },
  ]

  function groupsForUser(): NavigationGroup[] {
    if (isAdministrator)
      return [
        { label: t('nav.work'), items: [...work, problems, expenses] },
        ...(communicationItems.length
          ? [{ label: t('nav.communication'), items: communicationItems }]
          : []),
        { label: t('nav.objects'), items: objects },
        { label: t('nav.reports'), items: reports },
      ]
    if (usesManagerOnlyNavigation(user))
      return [{ label: '', items: managerPrimary }]
    if (isSpecialistNavigation)
      return [{ label: t('nav.work'), items: specialistWork }]
    if (user?.roles.includes('manager'))
      return [
        {
          label: t('nav.work'),
          items: work.filter(
            (item) => item.to !== '/work' || canAccessWorkSection(user),
          ),
        },
        {
          label: t('nav.objects'),
          items: objects.filter(
            (item) => !['/hotels', '/inventory'].includes(item.to),
          ),
        },
        { label: t('nav.finance'), items: managerFinance },
      ]
    return [
      {
        label: t('nav.work'),
        items: work.filter((item) => ['/', '/work'].includes(item.to)),
      },
    ]
  }

  return { groups: groupsForUser(), settings: isAdministrator ? settings : [], specialistWork, isSpecialistNavigation }
}
