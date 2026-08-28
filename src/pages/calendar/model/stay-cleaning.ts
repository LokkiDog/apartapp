import type { Stay } from '#fsd/entities/stay'

export type StayCleaningPresentation = {
  icon: string
  label: string
  className: string
}

export type StayCleaningTranslator = (key: string) => string

export function stayCleaningPresentation(stay: Pick<Stay, 'cleaning'>, translate?: StayCleaningTranslator): StayCleaningPresentation {
  const label = (key: string, fallback: string) => translate?.(key) || fallback
  if (!stay.cleaning?.id) {
    return {
      icon: 'i-lucide-sparkles',
      label: label('calendarExtra.cleaningMissing', 'Уборка не назначена'),
      className: 'stay-cleaning-indicator--missing'
    }
  }

  const status = stay.cleaning.status
  const statusPresentation: Record<string, { label: string; className: string }> = {
    assigned: { label: label('calendarExtra.cleaningAssigned', 'Уборка назначена'), className: 'stay-cleaning-indicator--assigned' },
    in_progress: { label: label('calendarExtra.cleaningInProgress', 'Уборка в работе'), className: 'stay-cleaning-indicator--in-progress' },
    completed: { label: label('calendarExtra.cleaningCompleted', 'Уборка завершена'), className: 'stay-cleaning-indicator--completed' },
    canceled: { label: label('calendarExtra.cleaningCanceled', 'Уборка отменена'), className: 'stay-cleaning-indicator--canceled' },
    unassigned: { label: label('calendarExtra.cleaningUnassigned', 'Уборка создана, исполнитель не назначен'), className: 'stay-cleaning-indicator--unassigned' }
  }
  const presentation = statusPresentation[status] ?? { label: label('calendarExtra.cleaningAssigned', 'Уборка назначена'), className: 'stay-cleaning-indicator--assigned' }
  return { icon: 'i-lucide-sparkles', ...presentation }
}

export function stayCleaningHref(stay: Pick<Stay, 'id' | 'cleaning'>) {
  return stay.cleaning?.id
    ? `/cleanings/${encodeURIComponent(stay.cleaning.id)}`
    : `/work?stayId=${encodeURIComponent(stay.id)}`
}
