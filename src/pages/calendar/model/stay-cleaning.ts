import type { Stay } from '#fsd/entities/stay'

export type StayCleaningPresentation = {
  icon: string
  label: string
  className: string
}

export function stayCleaningPresentation(stay: Pick<Stay, 'cleaning'>): StayCleaningPresentation {
  if (!stay.cleaning?.id) {
    return {
      icon: 'i-lucide-sparkles',
      label: 'Уборка не назначена',
      className: 'stay-cleaning-indicator--missing'
    }
  }

  const status = stay.cleaning.status
  const statusPresentation: Record<string, { label: string; className: string }> = {
    assigned: { label: 'Уборка назначена', className: 'stay-cleaning-indicator--assigned' },
    in_progress: { label: 'Уборка в работе', className: 'stay-cleaning-indicator--in-progress' },
    completed: { label: 'Уборка завершена', className: 'stay-cleaning-indicator--completed' },
    canceled: { label: 'Уборка отменена', className: 'stay-cleaning-indicator--canceled' },
    unassigned: { label: 'Уборка создана, исполнитель не назначен', className: 'stay-cleaning-indicator--unassigned' }
  }
  const presentation = statusPresentation[status] ?? { label: 'Уборка назначена', className: 'stay-cleaning-indicator--assigned' }
  return { icon: 'i-lucide-sparkles', ...presentation }
}

export function stayCleaningHref(stay: Pick<Stay, 'id' | 'cleaning'>) {
  return stay.cleaning?.id
    ? `/cleanings/${encodeURIComponent(stay.cleaning.id)}`
    : `/work?stayId=${encodeURIComponent(stay.id)}`
}
