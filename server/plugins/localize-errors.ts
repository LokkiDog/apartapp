type ApiLocale = 'ru' | 'en' | 'he'

const translations: Record<string, Partial<Record<ApiLocale, string>>> = {
  'Недостаточно прав': { en: 'Insufficient permissions', he: 'אין הרשאות מספיקות' },
  'Нет доступа к апартаменту': { en: 'You do not have access to this apartment', he: 'אין לך גישה לדירה זו' },
  'Апартамент не найден': { en: 'Apartment not found', he: 'הדירה לא נמצאה' },
  'Отель не найден': { en: 'Property not found', he: 'הנכס לא נמצא' },
  'Тип апартамента не найден': { en: 'Apartment type not found', he: 'סוג הדירה לא נמצא' },
  'Пользователь не найден': { en: 'User not found', he: 'המשתמש לא נמצא' },
  'Повторно отправить приглашение можно только приглашённому пользователю': { en: 'An invitation can only be resent to an invited user', he: 'ניתן לשלוח הזמנה מחדש רק למשתמש שהוזמן' },
  'Повторное приглашение пока недоступно': { en: 'The invitation cannot be resent yet', he: 'עדיין לא ניתן לשלוח את ההזמנה מחדש' },
  'Ссылка недействительна или истекла': { en: 'This link is invalid or has expired', he: 'הקישור אינו תקף או שפג תוקפו' },
  'Пароли не совпадают': { en: 'Passwords do not match', he: 'הסיסמאות אינן תואמות' },
  'Неверный месяц': { en: 'Invalid month', he: 'חודש לא חוקי' },
  'Отчёт недоступен': { en: 'Report is unavailable', he: 'הדוח אינו זמין' },
  'Расход не найден': { en: 'Expense not found', he: 'ההוצאה לא נמצאה' },
  'Уборка не найдена': { en: 'Cleaning not found', he: 'הניקיון לא נמצא' },
  'Заезд не найден': { en: 'Booking not found', he: 'ההזמנה לא נמצאה' },
  'Задача не найдена': { en: 'Task not found', he: 'המשימה לא נמצאה' },
  'Сервис не найден': { en: 'Service not found', he: 'השירות לא נמצא' },
  'Не удалось создать апартамент': { en: 'Could not create apartment', he: 'לא ניתן ליצור דירה' },
  'Не удалось обновить апартамент': { en: 'Could not update apartment', he: 'לא ניתן לעדכן דירה' },
  'Не удалось создать заезд': { en: 'Could not create booking', he: 'לא ניתן ליצור הזמנה' },
  'Не удалось добавить расход': { en: 'Could not add expense', he: 'לא ניתן להוסיף הוצאה' },
  'Некоторые услуги недоступны': { en: 'Some services are unavailable', he: 'חלק מהשירותים אינם זמינים' },
  'Заезд пересекается с существующим бронированием': { en: 'Booking overlaps an existing booking', he: 'ההזמנה חופפת להזמנה קיימת' }
}

function requestLocale(event: any): ApiLocale {
  const header = String(event?.node?.req?.headers?.['accept-language'] ?? '').toLowerCase()
  if (header.startsWith('he')) return 'he'
  if (header.startsWith('en')) return 'en'
  return 'ru'
}

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('error', (error, context) => {
    const message = error.statusMessage
    if (!message) return
    const locale = requestLocale(context.event)
    if (locale === 'ru') return
    const translated = translations[message]?.[locale]
    if (translated) {
      error.statusMessage = translated
      return
    }
    // Never leak a Russian system error into a non-Russian interface. Keep
    // detailed Russian diagnostics in server logs while returning a localized
    // safe fallback to the client.
    error.statusMessage = locale === 'en' ? 'An error occurred' : 'אירעה שגיאה'
  })
})
