import { expect, test } from '@playwright/test'

test('shows a clear offline notice while CRM data needs a connection', async ({ page, context }) => {
  await page.goto('/login')
  await page.waitForTimeout(300)
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL || 'admin@aparts.local')
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Сегодня в апартаментах' })).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByText('Нет соединения с интернетом. Данные CRM сейчас недоступны.')).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText('Нет соединения с интернетом. Данные CRM сейчас недоступны.')).toBeHidden()
})
