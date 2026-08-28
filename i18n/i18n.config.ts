import ru from './locales/ru.json'
import en from './locales/en.json'
import he from './locales/he.json'

export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: { ru, en, he }
}))
