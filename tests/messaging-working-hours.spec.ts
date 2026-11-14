import { describe, expect, it } from 'vitest'
import { awayPeriod } from '../server/modules/messaging/working-hours'

const schedule = { days: [1, 2, 3, 4, 5], opens: '09:00', closes: '18:00' }

describe('Messaging business hours', () => {
  it.each([
    ['2026-03-27T15:59:00Z', null], // Fri, 17:59 local
    ['2026-03-27T16:00:00Z', '2026-03-27'],
    ['2026-03-29T12:00:00Z', '2026-03-27'], // Sun after DST starts
    ['2026-03-30T05:59:00Z', '2026-03-27'],
    ['2026-03-30T06:00:00Z', null], // Mon, 09:00 local
    ['2026-03-30T15:00:00Z', '2026-03-30'],
  ])('uses the local opening and closing boundaries at %s', (at, expected) => {
    expect(awayPeriod(new Date(at), 'Europe/Sofia', schedule)).toBe(expected)
  })
})
