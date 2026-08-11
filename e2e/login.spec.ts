import { expect, test } from '@playwright/test'

test('administrator signs in and sees operational dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.waitForTimeout(500)
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL || 'admin@aparts.local')
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123')
  const responsePromise = page.waitForResponse(response => response.url().includes('/api/auth/login'))
  await page.getByRole('button', { name: 'Войти' }).click()
  expect((await responsePromise).status()).toBe(200)
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Сегодня в апартаментах' })).toBeVisible()
})
