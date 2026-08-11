import Decimal from 'decimal.js'

const MAX_EUR = new Decimal('9999999999.99')

export function parseEuroInput(value: string): number | null {
  const normalized = value.trim().replace(/\s|€/g, '').replace(',', '.')
  if (!normalized || !/^\d+(?:\.\d*)?$/.test(normalized)) return null
  try {
    const amount = new Decimal(normalized).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    return amount.lte(MAX_EUR) ? Number(amount) : null
  }
  catch { return null }
}

export function formatEuroInput(value: number | null) {
  if (value === null || value === undefined) return ''
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1').replace('.', ',')
}
