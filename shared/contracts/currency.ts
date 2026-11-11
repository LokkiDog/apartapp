export const currencies = ['EUR', 'USD', 'THB', 'RUB'] as const
export type Currency = typeof currencies[number]

export const defaultCurrency: Currency = 'EUR'
export const currencySymbols: Record<Currency, string> = { EUR: '€', USD: '$', THB: '฿', RUB: '₽' }
