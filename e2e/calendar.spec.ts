import { expect, test } from '@playwright/test'

for (const role of ['administrator', 'manager'] as const) {
  test(`booking workspace ${role}`, async ({ page }, info) => {
    if (info.project.name === 'desktop') await page.setViewportSize({ width: 1600, height: 1000 })
    const proofPath = (kind: string) => process.env.BOOKING_PROOF_DIR ? `${process.env.BOOKING_PROOF_DIR}/bookings-${info.project.name}-${role}-${kind}.png` : info.outputPath(`${kind}.png`)
    const user = { id: 'user-ui', organizationId: 'org-ui', name: 'UI Test', email: 'ui@example.test', roles: [role], locale: 'ru' }
    const hotel = { id: 'hotel-ui', name: 'Mountain View' }
    const apartments = Array.from({ length: 24 }, (_, i) => ({ id: `room-${i}`, name: `Mountain View ${i + 1}`, hotel, managers: [{ id: user.id, name: user.name }], building: '', locationDetails: '', additionalChecklist: [], status: 'active', automaticLinenCollection: false }))
    apartments[23]!.name = 'Mountain View — апартаменты с очень длинным названием корпуса'
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const date = new Date(`${today}T12:00:00Z`)
    const day = (offset: number) => new Date(date.getTime() + offset * 86400000).toISOString().slice(0, 10)
    const stays = apartments.slice(0, 12).map((a, i) => ({ id: `stay-${i}`, apartmentId: a.id, apartment: { name: a.name, hotel: { name: hotel.name } }, checkInOn: day(-2), checkOutOn: day(5), adultCount: 2, childCount: 0, guestName: `Гость ${i + 1}`, hasCleaning: false, cleaning: null, services: [], cashAmountEur: null }))
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem('aparts-pwa-install-card-dismissed-ios-v2', 'true')
      localStorage.setItem('aparts-pwa-install-card-dismissed', 'true')
    })
    let signedIn = false
    let failStays = false
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/stays' && failStays) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusMessage: 'UI test failure' }) }); return
      }
      if (path === '/api/users/me/locale') user.locale = route.request().postDataJSON().locale
      if (path === '/api/auth/login') signedIn = true
      const data = path === '/api/_auth/session' ? (signedIn ? { id: 'ui-session', user } : {}) : path === '/api/auth/me' ? user : path === '/api/apartments' ? apartments : path === '/api/hotels' ? [hotel] : path === '/api/stays' ? stays : path === '/api/auth/login' ? {} : path === '/api/auth/registration-mode' ? { mode: 'closed' } : path.includes('notification') ? { items: [], unreadCount: 0 } : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
    await page.locator('input[type=email]').fill('ui@example.test')
    await page.locator('input[type=password]').fill('UI test password')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await page.locator('nav a[href="/calendar"]').filter({ visible: true }).click()
    await expect(page.locator('.booking-timeline')).toBeVisible()
    await expect(page.locator('.calendar-apartment-label')).toHaveCount(24)
    await expect(page.locator('.calendar-week-stay').first()).toContainText('Гость 1')
    await page.locator('.calendar-week-stay').first().click()
    await expect(page.locator('.stay-calendar-popover')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Новая бронь', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Отмена', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
    await page.screenshot({ path: proofPath('timeline') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const geometry = await page.locator('.bookings-page--calendar').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, x: el.getBoundingClientRect().left }))
    if (info.project.name === 'mobile') expect(await page.locator('.bookings-toolbar').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(165)
    expect(geometry.height).toBeGreaterThan(400)
    if (geometry.width >= 1200) expect(await page.locator('.bookings-toolbar').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(65)
    const originalViewport = page.viewportSize()!
    for (const width of info.project.name === 'desktop' ? [768, 1440, 1460, 1600] : [360, 390]) {
      await page.setViewportSize({ width, height: originalViewport.height })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      const toolbarHeight = await page.locator('.bookings-toolbar').evaluate(el => el.getBoundingClientRect().height)
      if (width < 640) expect(toolbarHeight).toBeLessThan(165)
      if (width >= 1460) expect(toolbarHeight).toBeLessThan(65)
    }
    await page.setViewportSize(originalViewport)
    // Sticky dates and apartment labels survive scrolling in the same container.
    await page.locator('.calendar-board').evaluate(el => { el.scrollTop = 300; el.scrollLeft = 800 })
    const sticky = await page.locator('.calendar-board').evaluate(el => {
      const board = el.getBoundingClientRect(), header = el.querySelector('.booking-timeline__headings')!.getBoundingClientRect()
      const labels = [...el.querySelectorAll('.calendar-apartment-label')].map(n => n.getBoundingClientRect()).filter(r => r.bottom > board.top + 60 && r.top < board.bottom)
      return { top: Math.abs(header.top - board.top), left: labels.every(r => Math.abs(r.left - board.left) < 2) }
    })
    expect(sticky.top).toBeLessThan(2); expect(sticky.left).toBe(true)
    await page.locator('.calendar-board').evaluate(el => { el.scrollTop = 0; el.scrollLeft = 200 })
    const guestLabel = await page.locator('.calendar-week-stay').first().locator('.stay-calendar-trigger__left').evaluate(el => {
      const board = el.closest('.calendar-board')!.getBoundingClientRect()
      return el.getBoundingClientRect().left - board.left
    })
    expect(guestLabel).toBeGreaterThanOrEqual(164)
    if (role === 'administrator') {
      const separated = await page.locator('.calendar-week-stay').first().evaluate(el => {
        const label = el.querySelector('.stay-calendar-trigger__left')!.getBoundingClientRect(), marker = el.querySelector('.stay-cleaning-marker')!.getBoundingClientRect()
        return label.right <= marker.left
      })
      expect(separated).toBe(true)
    }
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
    await page.getByRole('button', { name: 'Сетка', exact: true }).click()
    await expect(page.locator('.calendar-month')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Период', exact: true })).toHaveCount(0)
    if (info.project.name === 'desktop') expect(await page.locator('.calendar-month').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ path: proofPath('grid') })
    await page.getByRole('combobox', { name: 'Тип событий' }).click()
    await page.getByRole('option', { name: /^Заезды/ }).click()
    await expect(page.locator('.calendar-month-week--markers').first()).toBeVisible()
    await page.getByRole('button', { name: 'Фильтры', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const scope = page.getByRole('dialog').locator('.property-scope-filter').getByRole('combobox').first()
    await scope.click()
    await page.getByRole('option', { name: 'Выбранные апартаменты', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.booking-timeline')).toHaveCount(0)
    await expect(page.locator('.calendar-month')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Фильтры', exact: true })).toContainText('1')
    await page.getByRole('button', { name: 'Фильтры', exact: true }).click()
    await scope.click()
    await page.getByRole('option', { name: 'Все объекты', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Список', exact: true }).click()
    await expect(page.getByRole('button', { name: 'По датам', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'По апартам', exact: true }).click()
    await expect(page.locator('.apartment-bookings').first()).toBeVisible()
    await page.getByRole('button', { name: 'Календарь', exact: true }).click()
    await expect(page.locator('.calendar-month-week--markers').first()).toBeVisible()
    await page.getByRole('button', { name: 'Лента', exact: true }).click()
    await page.getByRole('combobox', { name: 'Период', exact: true }).click()
    await page.getByRole('option', { name: 'Неделя', exact: true }).click()
    await expect(page.locator('.calendar-day-heading')).toHaveCount(7)
    await page.getByRole('combobox', { name: 'Период', exact: true }).click()
    await page.getByRole('option', { name: 'День', exact: true }).click()
    await expect(page.locator('.calendar-day-heading')).toHaveCount(1)
    await page.getByRole('button', { name: 'Сетка', exact: true }).click()
    await page.getByRole('button', { name: 'Лента', exact: true }).click()
    await expect(page.locator('.calendar-day-heading')).toHaveCount(1)
    // Persist independent choices when the page is mounted again.
    await page.locator(role === 'administrator' ? 'nav a[href="/"]' : 'nav a[href="/apartments"]').filter({ visible: true }).click()
    await page.locator('nav a[href="/calendar"]').filter({ visible: true }).click()
    await expect(page.locator('.calendar-day-heading')).toHaveCount(1)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aparts.calendar.preferences-v2')!))
    expect(saved).toMatchObject({ layout: 'calendar', grouping: 'apartments', calendarLayout: 'timeline', period: 'day' })
    failStays = true
    await page.getByRole('button', { name: 'Следующий период', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible()
    failStays = false
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(page.locator('.booking-timeline')).toBeVisible()
    if (info.project.name === 'desktop') {
      for (const language of ['English', 'עברית']) {
        await page.locator('.language-switcher').click()
        await page.getByRole('menuitemcheckbox', { name: language, exact: true }).click()
        await expect(page.locator('.booking-timeline')).toBeVisible()
      }
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      const rtl = await page.locator('.calendar-board').evaluate(el => {
        const board = el.getBoundingClientRect(), label = el.querySelector('.calendar-apartment-label')!.getBoundingClientRect()
        return Math.abs(label.right - board.right)
      })
      expect(rtl).toBeLessThan(2)
      await expect(page.getByRole('menu')).toHaveCount(0)
      await page.locator('.bookings-toolbar__period').click()
      await page.getByRole('option').first().click()
      await page.locator('.bookings-toolbar__events').click()
      await page.getByRole('option').first().click()
      await expect(page.locator('.calendar-week-stay').first()).toBeVisible()
      await expect(page.getByRole('listbox')).toHaveCount(0)
      const rtlToday = await page.locator('.calendar-day-heading--today').evaluate(el => {
        const board = el.closest('.calendar-board')!.getBoundingClientRect(), date = el.getBoundingClientRect()
        return date.left >= board.left && date.right <= board.right - 164
      })
      expect(rtlToday).toBe(true)
      await page.screenshot({ path: proofPath('rtl') })
    }
    expect(errors).toEqual([])
  })
}
