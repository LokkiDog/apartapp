// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref, watch, useTemplateRef, onBeforeUnmount, type Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import Home from '../guest/app/pages/index.vue'
import Detail from '../guest/app/pages/apartments/[slug].vue'
import Header from '../guest/app/components/SiteHeader.vue'
import ApartmentCard from '../guest/app/components/ApartmentCard.vue'
import { apartment } from './guest-catalogue-fixtures'
import { ru } from '../guest/app/content/ru'
import { en } from '../guest/app/content/en'
import { he } from '../guest/app/content/he'
import { bg } from '../guest/app/content/bg'
import { localizedGuestPath, type GuestLocale } from '../guest/shared/locale'
const Link = defineComponent({ props: ['to'], template: '<a :href="to"><slot /></a>' })
const items = ref([apartment('a'), apartment('b'), apartment('c'), apartment('d')])
const detailApartment = ref(apartment('a'))
const status = ref('success')
const error = ref<Error | null>(null)
const locale = ref<GuestLocale>('ru')
const refresh = vi.fn()
const wrappers: ReturnType<typeof mount>[] = []
async function page(component: Component = Home) {
  const Root = defineComponent({ components: { Page: component }, template: '<Suspense><Page /></Suspense>' })
  const wrapper = mount(Root, { global: { components: { ApartmentCard }, stubs: { NuxtLink: Link, SiteHero: true, SiteHost: true, SiteContact: true, ApartmentGallery: true, ApartmentLocation: true, AmenityIcon: true } } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  items.value = [apartment('a'), apartment('b'), apartment('c'), apartment('d')]
  detailApartment.value = apartment('a')
  status.value = 'success'; error.value = null; locale.value = 'ru'; refresh.mockReset()
  vi.stubGlobal('useSite', () => ({
    copy: computed(() => ({ ru, en, he, bg })[locale.value]), locale,
    isRtl: computed(() => locale.value === 'he'),
    localePath: (path: string) => localizedGuestPath(path, locale.value, true),
    pageUrl: (path = '/') => `https://example.test${localizedGuestPath(path, locale.value)}`,
    url: (path: string) => `https://example.test${path}`, setLocale: (value: GuestLocale) => { locale.value = value },
  }))
  vi.stubGlobal('useFetch', async (url: unknown) => ({ data: typeof url === 'function' ? detailApartment : items, status, error, refresh }))
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  vi.stubGlobal('useRoute', () => ({ fullPath: '/', params: { slug: 'a' } }))
  vi.stubGlobal('useCookie', () => ref('dark'))
  vi.stubGlobal('useApartmentEnquiry', () => ({ current: ref(null), open: ref(false) }))
  for (const [key, value] of Object.entries({ computed, ref, watch, useTemplateRef, onBeforeUnmount })) vi.stubGlobal(key, value)
})
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.length = 0; vi.unstubAllGlobals() })
it.each([0, 1, 3, 5])('shows at most three apartments in catalogue order when %i are published', async count => {
  items.value = Array.from({ length: count }, (_, index) => apartment(`apt-${index}`))
  const wrapper = await page()
  expect(wrapper.findAll('.card-description h3').map(title => title.text())).toEqual(Array.from({ length: Math.min(count, 3) }, (_, index) => `APT-${index}`))
  expect(wrapper.get('.home-apartments-link').attributes('href')).toBe('/apartments?lang=ru')
  expect(wrapper.text().includes(ru.empty)).toBe(count === 0)
  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(wrapper.find('.catalogue-map-button').exists()).toBe(false)
})
it('shows loading, a retryable error and the recovered selection without stale cards', async () => {
  status.value = 'pending'
  const wrapper = await page()
  expect(wrapper.findAll('.photo-skeleton')).toHaveLength(3)
  expect(wrapper.find('.card-description').exists()).toBe(false)
  status.value = 'error'; error.value = new Error('Unavailable')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(ru.error)
  await wrapper.get('[role="alert"] button').trigger('click')
  expect(refresh).toHaveBeenCalledOnce()
  status.value = 'success'; error.value = null
  await flushPromises()
  expect(wrapper.findAll('.card-description')).toHaveLength(3)
})
it.each(['ru', 'en', 'he', 'bg'] as const)('preserves %s in home, catalogue, apartment and contact navigation', async language => {
  locale.value = language
  const wrapper = await page()
  expect(wrapper.get('#apartments').exists()).toBe(true)
  expect(wrapper.get('.home-apartments-link').attributes('href')).toBe(`/apartments?lang=${language}`)
  expect(wrapper.get('.card-description').attributes('href')).toBe(`/apartments/a?lang=${language}`)
  const detail = await page(Detail)
  expect(detail.get('.back-link').attributes('href')).toBe(`/apartments?lang=${language}`)
  const header = mount(Header, { global: { stubs: { NuxtLink: Link, SiteContact: true } } }); wrappers.push(header)
  expect(header.get('.brand').attributes('href')).toBe(`/?lang=${language}`)
  expect(header.get('.desktop-nav a').attributes('href')).toBe(`/apartments?lang=${language}`)
  expect(header.findAll('.desktop-nav a')[1]!.attributes('href')).toBe(`/?lang=${language}#contacts`)
  await header.get('.menu-toggle').trigger('click')
  expect(header.get('.mobile-nav a').attributes('href')).toBe(`/apartments?lang=${language}`)
})

it('lists only published amenities and places hotel location after the apartment details', async () => {
  detailApartment.value = { ...apartment('a'), amenities: ['wifi', 'kitchen', 'washing_machine'], location: 'Near the park' }
  const detail = await page(Detail)
  expect(detail.findAll('.amenities li').map(item => item.text())).toEqual(['Wi-Fi', 'Кухня', 'Стиральная машина'])
  expect(detail.findAll('.amenities amenity-icon-stub')).toHaveLength(3)
  const columns = detail.get('.detail-columns').element
  const location = detail.get('apartment-location-stub').element
  expect(columns.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  detailApartment.value = { ...apartment('a'), amenities: [] }
  await flushPromises()
  expect(detail.find('.amenities').exists()).toBe(false)
})
