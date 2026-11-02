// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import CataloguePage from '../guest/app/pages/apartments/index.vue'
import { apartment } from './guest-catalogue-fixtures'
import { ru } from '../guest/app/content/ru'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
const items = ref([apartment('a104'), apartment('b203')])
let wrapper: ReturnType<typeof mount> | undefined
const scroll = vi.fn()
let observeCatalogue: (visible: boolean) => void
const Card = defineComponent({ props: ['apartment', 'highlighted'], template: '<article :data-selected="highlighted"><a class="card-description" href="#">{{ apartment.title }}</a></article>' })
const Map = defineComponent({ props: ['apartments'], emits: ['select'], template: `<div class="test-map"><button v-for="apartment in apartments" :key="apartment.slug" :data-slug="apartment.slug" @click="$emit('select', apartment.slug)">{{ apartment.title }}</button></div>` })
beforeEach(() => {
  items.value = [apartment('a104'), apartment('b203')]
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      observeCatalogue = visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('useSite', () => ({ copy: computed(() => ru), pageUrl: (path = '/') => `https://example.test${path}`, locale: ref('ru') }))
  vi.stubGlobal('useFetch', async () => ({ data: items, status: ref('success'), error: ref(null), refresh: vi.fn() }))
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  for (const [key, value] of Object.entries({ ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick })) vi.stubGlobal(key, value)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('scrollIntoView', scroll)
  HTMLElement.prototype.scrollIntoView = scroll
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals(); scroll.mockClear() })
it('loads the mobile map on demand and returns selection and focus to the chosen card', async () => {
  const Root = defineComponent({ components: { CataloguePage }, template: '<Suspense><CataloguePage /></Suspense>' })
  wrapper = mount(Root, { attachTo: document.body, global: { stubs: { ApartmentCard: Card, CatalogueMap: Map, SiteHost: true, SiteHero: true, AmenityIcon: true, ClientOnly: { template: '<slot />' } } } })
  await flushPromises()
  expect(wrapper.find('.test-map').exists()).toBe(false)
  await wrapper.get('.catalogue-map-button').trigger('click')
  expect(wrapper.get('.catalogue-map-dialog').attributes('open')).toBeDefined()
  expect(wrapper.findAll('.test-map')).toHaveLength(1)
  await wrapper.get('.test-map button[data-slug="b203"]').trigger('click')
  await nextTick()
  expect(wrapper.get('.catalogue-map-dialog').attributes('open')).toBeUndefined()
  expect(wrapper.get('#apartment-b203').attributes('data-selected')).toBe('true')
  expect(document.activeElement).toBe(wrapper.get('#apartment-b203 a').element)
  expect(scroll).toHaveBeenCalled()
})

it('keeps the map action fixed on narrow screens only while the catalogue is visible', async () => {
  const Root = defineComponent({ components: { CataloguePage }, template: '<Suspense><CataloguePage /></Suspense>' })
  wrapper = mount(Root, { attachTo: document.body, global: { stubs: { ApartmentCard: Card, CatalogueMap: Map, SiteHost: true, SiteHero: true, AmenityIcon: true, ClientOnly: { template: '<slot />' } } } })
  await flushPromises()
  const action = wrapper.get('.catalogue-map-button')
  const browser = new Window({ width: 800, height: 900 })
  browser.document.head.innerHTML = `<style>${readFileSync('guest/app/assets/catalogue.css', 'utf8')}</style>`
  try {
    browser.document.body.innerHTML = action.element.outerHTML
    expect(browser.getComputedStyle(browser.document.querySelector('button')!).display).toBe('none')
    observeCatalogue(true); await nextTick()
    browser.document.body.innerHTML = action.element.outerHTML
    const button = browser.document.querySelector('button')!
    expect(browser.getComputedStyle(button).display).not.toBe('none')
    expect(browser.getComputedStyle(button).position).toBe('fixed')
    browser.happyDOM.setWindowSize({ width: 1280, height: 900 })
    browser.document.body.innerHTML = action.element.outerHTML
    expect(browser.getComputedStyle(browser.document.querySelector('button')!).display).toBe('none')
    observeCatalogue(false); await nextTick()
    browser.happyDOM.setWindowSize({ width: 800, height: 900 })
    browser.document.body.innerHTML = action.element.outerHTML
    expect(browser.getComputedStyle(browser.document.querySelector('button')!).display).toBe('none')
  } finally { await browser.happyDOM.close() }
})

it('combines hotel and all selected amenities, updates the map, handles no matches and resets', async () => {
  items.value = [
    { ...apartment('a104'), hotel: { id: 'hotel-a', name: 'Hotel A' }, amenities: ['wifi', 'kitchen', 'dishwasher'] },
    { ...apartment('b203', 'hotel-b'), hotel: { id: 'hotel-b', name: 'Hotel B' }, amenities: ['wifi'] },
    { ...apartment('c305'), amenities: ['kitchen'] },
    { ...apartment('no-coordinates'), hotel: { id: 'hotel-a', name: 'Hotel A' }, mapLocation: null, amenities: ['wifi'] },
  ]
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const Root = defineComponent({ components: { CataloguePage }, template: '<Suspense><CataloguePage /></Suspense>' })
  wrapper = mount(Root, { attachTo: document.body, global: { stubs: { ApartmentCard: Card, CatalogueMap: Map, SiteHost: true, SiteHero: true, AmenityIcon: true, ClientOnly: { template: '<slot />' } } } })
  await flushPromises()
  const cardTitles = () => wrapper!.findAll('.catalogue-grid article a').map(item => item.text())
  const mapTitles = () => wrapper!.findAll('.test-map button').map(item => item.text())
  expect(cardTitles()).toEqual(['A104', 'B203', 'C305', 'NO-COORDINATES'])
  await wrapper.get('.test-map button[data-slug="b203"]').trigger('click')
  await wrapper.get('select').setValue('hotel-a')
  expect(cardTitles()).toEqual(['A104', 'C305', 'NO-COORDINATES'])
  expect(mapTitles()).toEqual(['A104', 'C305', 'NO-COORDINATES'])
  expect(wrapper.get('#apartment-a104').attributes('data-selected')).toBe('true')
  await wrapper.get('.filter-quick[data-amenity="wifi"]').trigger('click')
  expect(cardTitles()).toEqual(['A104', 'NO-COORDINATES'])
  await wrapper.get('.filter-open').trigger('click')
  await wrapper.get('input[value="dishwasher"]').setValue(true)
  await wrapper.get('input[value="kitchen"]').setValue(true)
  await wrapper.get('.filter-apply').trigger('click')
  expect(cardTitles()).toEqual(['A104'])
  expect(mapTitles()).toEqual(['A104'])
  await wrapper.get('select').setValue('hotel-b')
  expect(cardTitles()).toEqual([])
  expect(wrapper.get('[role="status"]').text()).toContain(ru.noFilterResults)
  expect(wrapper.find('.test-map').exists()).toBe(false)
  await wrapper.get('[role="status"] button').trigger('click')
  expect(cardTitles()).toEqual(['A104', 'B203', 'C305', 'NO-COORDINATES'])
  expect(mapTitles()).toEqual(['A104', 'B203', 'C305', 'NO-COORDINATES'])
  expect(wrapper.get('select').element.value).toBe('')
  expect(wrapper.findAll('.filter-quick[aria-pressed="true"]')).toHaveLength(0)
})

it('shares quick filters with the modal, keeps a cancellable draft, applies settings and clears them', async () => {
  items.value = [
    { ...apartment('a104'), amenities: ['wifi', 'kitchen'] },
    { ...apartment('b203'), amenities: ['wifi'] },
    { ...apartment('c305', 'hotel-b'), amenities: ['parking'] },
  ]
  const Root = defineComponent({ components: { CataloguePage }, template: '<Suspense><CataloguePage /></Suspense>' })
  wrapper = mount(Root, { attachTo: document.body, global: { stubs: { ApartmentCard: Card, CatalogueMap: Map, SiteHost: true, SiteHero: true, AmenityIcon: true, ClientOnly: { template: '<slot />' } } } })
  await flushPromises()
  const titles = () => wrapper!.findAll('.catalogue-grid article a').map(item => item.text())
  const wifi = wrapper.get('.filter-quick[data-amenity="wifi"]')
  await wifi.trigger('click')
  expect(titles()).toEqual(['A104', 'B203'])
  expect(wifi.attributes('aria-pressed')).toBe('true')
  await wrapper.get('.filter-open').trigger('click')
  expect(wrapper.get('.catalogue-filter-dialog').attributes('open')).toBeDefined()
  expect((wrapper.get('input[value="wifi"]').element as HTMLInputElement).checked).toBe(true)
  await wrapper.get('input[value="kitchen"]').setValue(true)
  expect(wrapper.get('.filter-apply').text()).toContain('(1)')
  expect(titles()).toEqual(['A104', 'B203'])
  await wrapper.get('.filter-close').trigger('click')
  expect(wrapper.get('.catalogue-filter-dialog').attributes('open')).toBeUndefined()
  expect(titles()).toEqual(['A104', 'B203'])
  expect(document.activeElement).toBe(wrapper.get('.filter-open').element)
  await wrapper.get('.filter-open').trigger('click')
  expect((wrapper.get('input[value="kitchen"]').element as HTMLInputElement).checked).toBe(false)
  await wrapper.get('input[value="kitchen"]').setValue(true)
  await wrapper.get('.filter-apply').trigger('click')
  expect(titles()).toEqual(['A104'])
  expect(wrapper.get('.filter-count').text()).toBe('2')
  await wrapper.get('.filter-open').trigger('click')
  await wrapper.get('.filter-clear').trigger('click')
  expect(wrapper.findAll('input:checked')).toHaveLength(0)
  expect(wrapper.get('.filter-apply').text()).toContain('(3)')
  expect(titles()).toEqual(['A104'])
  await wrapper.get('.filter-dialog-body select').setValue('hotel-b')
  await wrapper.get('.filter-apply').trigger('click')
  expect(titles()).toEqual(['C305'])
  expect(wrapper.get('.filter-hotel select').element.value).toBe('hotel-b')
  expect(wifi.attributes('aria-pressed')).toBe('false')
  await wrapper.get('.catalogue-filter-reset').trigger('click')
  expect(titles()).toEqual(['A104', 'B203', 'C305'])
  expect(wrapper.find('.filter-count').exists()).toBe(false)
})
