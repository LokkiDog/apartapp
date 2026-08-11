import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  const submit = page.getByRole('button', { name: 'Войти' })
  await expect(submit).toBeEnabled()
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL || 'admin@aparts.local')
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123')
  const response = page.waitForResponse(item => item.url().includes('/api/auth/login'))
  await submit.click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL('/')
}

test('administrator navigation, EUR input and responsive shell work', async ({ page }, testInfo) => {
  await login(page)

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Ещё' }).click()
    await page.getByRole('link', { name: 'Пользователи' }).click()
  } else {
    await page.getByRole('link', { name: 'Пользователи' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible()

  await page.goto('/admin')
  await expect(page).toHaveURL('/settings/users')

  await page.goto('/settings/services')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Добавить услугу' }).click()
  const price = page.getByLabel('Цена')
  await price.fill('10.555')
  await price.blur()
  await expect(price).toHaveValue('10,56')

  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow, `horizontal overflow at ${width}px`).toBe(false)
  }

  await page.goto('/apartments')
  await expect(page.getByRole('heading', { name: 'Апартаменты' })).toBeVisible()
  const cards = page.locator('.apartment-card')
  const emptyState = page.getByRole('heading', { name: 'Апартаментов пока нет' })
  await expect(cards.first().or(emptyState)).toBeVisible()
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow, `apartment cards overflow at ${width}px`).toBe(false)
  }
})
