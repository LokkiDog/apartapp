import { describe, expect, it } from 'vitest'
import { formatCurrency } from '../src/shared/lib/format'

describe('profile currency display', () => {
  it.each([
    ['EUR', '€'],
    ['USD', '$'],
    ['THB', '฿'],
    ['RUB', '₽'],
  ] as const)('formats %s amounts with their original value and precision', (currency, symbol) => {
    expect(formatCurrency(-1234.5, currency, 'en-US')).toBe(`-${symbol}1,234.50`)
    expect(formatCurrency(0, currency, 'ru-RU')).toBe(`0,00\u00a0${symbol}`)
  })
})
