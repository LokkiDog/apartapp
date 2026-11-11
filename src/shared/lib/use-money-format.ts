import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { currencySymbols, defaultCurrency, type Currency } from '@contracts/currency'
import { useCurrentUser } from '../auth'
import { formatCurrency, toFormatLocale } from './format'

export function useMoneyFormat() {
  const user = useCurrentUser()
  const { locale } = useI18n()
  const currency = computed(() => user.value?.currency ?? defaultCurrency)
  const currencySymbol = computed(() => currencySymbols[currency.value])

  function formatMoney(amount: number, displayCurrency: Currency = currency.value) {
    return formatCurrency(amount, displayCurrency, toFormatLocale(locale.value))
  }

  return { currency, currencySymbol, formatMoney }
}
