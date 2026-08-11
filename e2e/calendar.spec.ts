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
  await expect(page.locator('.calendar-week-grid')).toBeVisible()
  await expect(page.locator('.calendar-stay').first()).toBeVisible()
  await page.getByRole('button', { name: 'Неделя' }).click()
  await expect(page.getByRole('button', { name: 'Месяц' })).toBeVisible()
  await page.getByRole('button', { name: 'Месяц' }).click()
  await expect(page.locator('.calendar-month')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Список' })).toBeVisible()
  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasPageOverflow).toBe(false)
})
