import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('calendar role visibility', () => {
  it('shows additional-service prices only with administrator financial access', () => {
    const calendar = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const details = readFileSync('src/pages/calendar/StayDetailsSlideover.vue', 'utf8')

    expect(calendar).toContain("const showFinancialDetails = computed(() => Boolean(user.value?.roles.includes('administrator')))")
    expect(calendar).toContain(':show-service-prices="showFinancialDetails"')
    expect(calendar).toContain('<span v-if="showFinancialDetails" class="font-semibold tabular-nums">{{ formatEuro(service.priceEur) }}</span>')
    expect(details).toContain('<strong v-if="showServicePrices">{{ formatEuro(service.priceEurSnapshot) }}</strong>')
  })
})
