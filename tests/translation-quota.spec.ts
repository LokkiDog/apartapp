import { describe, expect, it } from 'vitest'
import { monthlyTranslationLimit, translationCharacterCount } from '../server/infrastructure/translation/quota'

describe('translation budget accounting', () => {
  it.each([
    ['А', 3], ['א', 3], ['😀', 3], ['a b', 9], ['e\u0301', 6]
  ])('counts Unicode code points on all three target languages for %s', (name, expected) => {
    expect(translationCharacterCount(name)).toBe(expected)
  })

  it.each([0, '0', 450000, '450000', '1000'])('accepts the safe limit %s', value => {
    expect(monthlyTranslationLimit(value)).toBe(Number(value))
  })

  it.each(['', '-1', -1, '500000', 450001, 1.5, '1e5', 'bad', null, undefined])('fails closed for the invalid limit %s', value => {
    expect(() => monthlyTranslationLimit(value)).toThrow('Invalid translation limit')
  })
})
