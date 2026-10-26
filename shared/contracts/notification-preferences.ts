import { z } from 'zod'
import type { UserRole } from './crm'

export const notificationChannels = ['crm', 'push', 'email'] as const
export type NotificationChannel = typeof notificationChannels[number]
export const notificationDefaults = { crm: true, push: true, email: false }
export const notificationEvents = [
  {"key": "booking_created", "category": "bookings", "roles": ["administrator"], "label": {"ru": "Новое бронирование", "en": "New booking", "he": "הזמנה חדשה"}},
  {"key": "booking_updated", "category": "bookings", "roles": ["administrator"], "label": {"ru": "Изменение бронирования", "en": "Booking changed", "he": "שינוי הזמנה"}},
  {"key": "booking_conflict", "category": "bookings", "roles": ["administrator", "manager"], "label": {"ru": "Конфликт бронирований", "en": "Booking conflict", "he": "התנגשות בהזמנות"}},
  {"key": "cleaning_scheduled", "category": "cleanings", "roles": ["administrator"], "label": {"ru": "Создание уборки", "en": "Cleaning scheduled", "he": "תכנון ניקיון"}},
  {"key": "cleaning_assigned", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Назначение уборки", "en": "Cleaning assigned", "he": "הקצאת ניקיון"}},
  {"key": "cleaning_unassigned", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Снятие исполнителя", "en": "Assignment removed", "he": "ביטול הקצאה"}},
  {"key": "cleaning_rescheduled", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Перенос уборки", "en": "Cleaning rescheduled", "he": "שינוי מועד ניקיון"}},
  {"key": "cleaning_combined", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Изменение даты и исполнителей", "en": "Date and assignees changed", "he": "שינוי מועד וצוות"}},
  {"key": "cleaning_accepted", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Принятие уборки", "en": "Cleaning accepted", "he": "קבלת ניקיון"}},
  {"key": "cleaning_started", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Начало уборки", "en": "Cleaning started", "he": "תחילת ניקיון"}},
  {"key": "cleaning_completed", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Завершение уборки", "en": "Cleaning completed", "he": "סיום ניקיון"}},
  {"key": "cleaning_canceled", "category": "cleanings", "roles": ["administrator", "manager", "cleaner"], "label": {"ru": "Отмена уборки", "en": "Cleaning canceled", "he": "ביטול ניקיון"}},
  {"key": "cleaning_deleted", "category": "cleanings", "roles": ["administrator", "cleaner"], "label": {"ru": "Удаление уборки", "en": "Cleaning deleted", "he": "מחיקת ניקיון"}},
  {"key": "task_assigned", "category": "tasks", "roles": ["administrator", "cleaner", "specialist"], "label": {"ru": "Назначение задачи", "en": "Task assigned", "he": "הקצאת משימה"}},
  {"key": "task_canceled", "category": "tasks", "roles": ["administrator", "cleaner", "specialist"], "label": {"ru": "Отмена задачи", "en": "Task canceled", "he": "ביטול משימה"}},
  {"key": "task_resolved", "category": "tasks", "roles": ["administrator"], "label": {"ru": "Задача ожидает проверки", "en": "Task awaits review", "he": "משימה ממתינה לבדיקה"}},
  {"key": "task_returned", "category": "tasks", "roles": ["administrator", "cleaner", "specialist"], "label": {"ru": "Возврат задачи в работу", "en": "Task returned to work", "he": "החזרת משימה לביצוע"}},
  {"key": "problem_created", "category": "problems", "roles": ["administrator"], "label": {"ru": "Новая проблема", "en": "New problem", "he": "בעיה חדשה"}},
  {"key": "problem_deletion_requested", "category": "problems", "roles": ["administrator"], "label": {"ru": "Запрос удаления проблемы", "en": "Problem deletion requested", "he": "בקשה למחיקת בעיה"}},
  {"key": "problem_deleted", "category": "problems", "roles": ["administrator", "manager", "cleaner", "specialist"], "label": {"ru": "Удаление проблемы", "en": "Problem deleted", "he": "מחיקת בעיה"}},
  {"key": "problem_deletion_rejected", "category": "problems", "roles": ["administrator", "manager", "cleaner", "specialist"], "label": {"ru": "Удаление проблемы отклонено", "en": "Problem deletion declined", "he": "מחיקת בעיה נדחתה"}},
  {"key": "expense_report_published", "category": "reports", "roles": ["administrator", "manager"], "label": {"ru": "Публикация отчёта по расходам", "en": "Expense report published", "he": "פרסום דוח הוצאות"}},
  {"key": "manual", "category": "messages", "roles": ["administrator", "manager", "cleaner", "specialist"], "label": {"ru": "Сообщение администратора", "en": "Administrator message", "he": "הודעת מנהל"}},
 ] as const
export type NotificationEventKey = typeof notificationEvents[number]['key']
export const notificationEventSchema = z.enum(notificationEvents.map(event => event.key) as [NotificationEventKey, ...NotificationEventKey[]])
export const notificationPreferenceSchema = z.object({ event: notificationEventSchema, crm: z.boolean(), push: z.boolean(), email: z.boolean() }).strict()
export const notificationPreferencesUpdateSchema = z.object({ changes: z.array(notificationPreferenceSchema).min(1).max(notificationEvents.length) }).strict().refine(value => new Set(value.changes.map(row => row.event)).size === value.changes.length, 'Duplicate events')
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>
export function availableNotificationEvents(roles: readonly UserRole[]) {
  return notificationEvents.filter(event => event.roles.some(role => roles.includes(role)))
}
export function effectiveNotificationChannels(preference?: Pick<NotificationPreference, NotificationChannel> | null) {
  return preference ? { crm: preference.crm, push: preference.push, email: preference.email } : { ...notificationDefaults }
}
