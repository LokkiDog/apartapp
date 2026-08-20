import { expect, test } from '@playwright/test'

test('calendar switches between agenda, week and month', async ({ page }) => {
  await page.goto('/login')
  await page.waitForTimeout(300)
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL || 'admin@aparts.local')
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123')
  const response = page.waitForResponse(item => item.url().includes('/api/auth/login'))
  await page.getByRole('button', { name: 'Войти' }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL('/')

  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Заезды' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'По датам' })).toBeVisible()

  const agendaDay = page.locator('.stay-agenda-day').first()
  const agendaContent = agendaDay.locator('[data-slot="content"]')
  await expect(agendaDay).toBeVisible()
  await expect(agendaDay.locator('.stay-agenda-category')).toHaveCount(3)
  await agendaDay.locator('.stay-agenda-day__header').click()
  await expect(agendaContent).toHaveCount(0)
  await agendaDay.locator('.stay-agenda-day__header').click()
  await expect(agendaContent).toBeVisible()

  await page.getByRole('button', { name: 'Новый заезд' }).click()
  const servicesSection = page.getByText('Дополнительные услуги').locator('..')
  const firstService = servicesSection.getByRole('checkbox').first()
  await expect(firstService).not.toBeChecked()
  await firstService.click()
  await expect(firstService).toBeChecked()
  await firstService.click()
  await expect(firstService).not.toBeChecked()
  await page.getByRole('button', { name: 'Отмена' }).click()

  await page.getByRole('button', { name: 'Неделя' }).click()
  await expect(page.locator('.calendar-week-grid')).toBeVisible()
  await expect(page.locator('.calendar-stay').first()).toBeVisible()
  await expect(page.locator('.calendar-week-events').first()).toHaveCSS('grid-template-columns', /.+/)

  await page.getByLabel('Показывать').click()
  await page.getByRole('option', { name: 'Выбранные апартаменты' }).click()
  await expect(page.getByRole('heading', { name: 'Выберите область календаря' })).toBeVisible()

  const apartmentRequest = page.waitForRequest(request => request.url().includes('/api/stays') && request.url().includes('apartmentIds'))
  await page.getByLabel('Апартаменты').click()
  await page.getByRole('option').first().click()
  await apartmentRequest
  await expect(page.locator('.calendar-week-grid')).toBeVisible()
  await page.getByRole('button', { name: /^Убрать апартамент / }).first().click()
  await expect(page.getByRole('heading', { name: 'Выберите область календаря' })).toBeVisible()

  await page.getByLabel('Показывать').click()
  await page.getByRole('option', { name: 'Все объекты' }).click()
  await expect(page.locator('.calendar-week-grid')).toBeVisible()
  await page.getByRole('button', { name: 'Неделя' }).click()
  await expect(page.getByRole('button', { name: 'Месяц' })).toBeVisible()
  await page.getByRole('button', { name: 'Месяц' }).click()
  await expect(page.locator('.calendar-month')).toBeVisible()
  await expect(page.locator('.calendar-month-week-row').first()).toBeVisible()
  await expect(page.locator('.calendar-month-stay').first()).toBeVisible()

  const firstStay = page.locator('.calendar-month-stay').first()
  await firstStay.focus()
  await expect(page.locator('.stay-calendar-popover')).toHaveCount(1)

  const more = page.getByRole('button', { name: /Ещё \d+/ }).first()
  if (await more.isVisible().catch(() => false)) {
    await more.click()
    await expect(page.getByRole('button', { name: 'Свернуть' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Свернуть' }).first().click()
  }

  await page.getByRole('button', { name: 'Проживания' }).click()
  await expect(page.locator('.calendar-month-week--markers').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'По датам' })).toBeVisible()
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasPageOverflow, `calendar page overflow at ${width}px`).toBe(false)
  }
})
