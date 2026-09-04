import { expect, test } from '@playwright/test'
import sharp from 'sharp'

async function login(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('aparts-pwa-install-card-dismissed', 'true')
    localStorage.setItem('aparts-pwa-install-card-dismissed-ios-v2', 'true')
  })
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL || 'admin@aparts.local')
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL('/')
}

async function fixture(format: 'jpeg' | 'png' | 'webp', name: string, color: string) {
  const image = sharp({ create: { width: 320, height: 180, channels: 3, background: color } })
  const buffer = format === 'jpeg' ? await image.jpeg().toBuffer() : format === 'png' ? await image.png().toBuffer() : await image.webp().toBuffer()
  return { name, mimeType: `image/${format === 'jpeg' ? 'jpeg' : format}`, buffer }
}

test('administrator creates, browses, and deletes apartment photos', async ({ page }) => {
  test.setTimeout(90_000)
  let apartmentId: string | undefined

  try {
    await login(page)
    const suffix = Date.now().toString()
    const hotels = await (await page.request.get('/api/hotels')).json()
    const types = await (await page.request.get('/api/apartment-types')).json()
    const hotel = hotels[0] ?? await (await page.request.post('/api/hotels', { data: { name: `Фото отель ${suffix}`, address: 'Bansko', latitude: 41.84, longitude: 23.49 } })).json()
    const type = types[0] ?? await (await page.request.post('/api/apartment-types', { data: { name: `Фото тип ${suffix}`, cleanerPoolEur: 1, laundryEur: 1, serviceEur: 1 } })).json()
    const apartmentName = `Фото тест ${suffix}`

    await page.goto('/apartments/new')
    await page.locator('input[type="file"]').setInputFiles([
      await fixture('jpeg', 'first.jpg', '#b91c1c'),
      await fixture('png', 'second.png', '#2563eb'),
      await fixture('webp', 'third.webp', '#15803d')
    ])
    await expect(page.locator('.apartment-photo-panel__item')).toHaveCount(3)
    await page.locator('.apartment-photo-panel__remove').first().click()
    await expect(page.locator('.apartment-photo-panel__item')).toHaveCount(2)

    await page.getByLabel('Название').fill(apartmentName)
    await page.getByLabel('Апарт-отель').click()
    await page.getByText(hotel.name, { exact: true }).click()
    await page.getByLabel('Тип апартамента').click()
    await page.getByText(type.name, { exact: true }).click()
    await page.getByLabel('Гостей').fill('2')
    await page.getByLabel('Комнат').fill('1')
    await page.getByRole('button', { name: 'Создать' }).click()
    await expect(page).toHaveURL('/apartments')

    const createdApartments = await (await page.request.get('/api/apartments')).json()
    apartmentId = createdApartments.find((apartment: { name: string }) => apartment.name === apartmentName)?.id
    expect(apartmentId).toBeTruthy()

    const card = page.locator('.apartment-card').filter({ hasText: apartmentName })
    await expect(card.locator('.apartment-photo-carousel__counter')).toHaveText('1 из 2')
    await card.getByRole('button', { name: 'Следующее фото' }).click()
    await expect(card.locator('.apartment-photo-carousel__counter')).toHaveText('2 из 2')
    await card.locator('.apartment-photo-carousel__viewport').evaluate(element => element.scrollTo({ left: 0, behavior: 'instant' }))
    await expect(card.locator('.apartment-photo-carousel__counter')).toHaveText('1 из 2')

    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }

    await card.locator('.apartment-card__body').click()
    await expect(page).toHaveURL(/\/apartments\/([^/]+)\/edit/)
    await expect(page.locator('.apartment-photo-panel__item')).toHaveCount(2)
    await page.locator('input[type="file"]').setInputFiles([
      await fixture('jpeg', 'edit-first.jpg', '#7c3aed'),
      await fixture('webp', 'edit-second.webp', '#d97706')
    ])
    await expect(page.locator('.apartment-photo-panel__item')).toHaveCount(4)
    await page.locator('.apartment-photo-panel__remove').first().click()
    await page.getByRole('button', { name: 'Удалить' }).click()
    await expect(page.locator('.apartment-photo-panel__item')).toHaveCount(3)
  } finally {
    if (apartmentId) await page.request.delete(`/api/apartments/${apartmentId}`)
  }
})
