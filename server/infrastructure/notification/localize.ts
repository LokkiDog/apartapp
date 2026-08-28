type AppLocale = 'ru' | 'en' | 'he'
type NotificationType = 'stay_changed' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published'

const titles: Record<NotificationType, Record<AppLocale, string>> = {
  stay_changed: { ru: 'Изменение заезда', en: 'Booking updated', he: 'הזמנה עודכנה' },
  work_assigned: { ru: 'Назначена работа', en: 'Work assigned', he: 'עבודה הוקצתה' },
  work_rescheduled: { ru: 'Работа перенесена', en: 'Work rescheduled', he: 'מועד העבודה שונה' },
  work_canceled: { ru: 'Работа отменена', en: 'Work canceled', he: 'העבודה בוטלה' },
  problem: { ru: 'Проблема в работе', en: 'Work problem', he: 'בעיה בעבודה' },
  manager_expense_report_published: { ru: 'Доступен отчёт по расходам', en: 'Expense report available', he: 'דוח הוצאות זמין' }
}

export function localizedNotificationTitle(type: NotificationType, locale: AppLocale, fallback: string) {
  return titles[type]?.[locale] ?? fallback
}

export function localizedNotificationBody(type: NotificationType, locale: AppLocale, fallback: string) {
  if (type !== 'work_assigned' || !['Вам назначена уборка', 'Вам назначена задача'].includes(fallback)) return fallback
  return locale === 'en' ? (fallback.includes('задача') ? 'A task was assigned to you' : 'A cleaning was assigned to you') : locale === 'he' ? (fallback.includes('задача') ? 'הוקצתה לכם משימה' : 'הוקצה לכם ניקיון') : fallback
}
