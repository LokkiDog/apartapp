// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import Location from '../guest/app/components/ApartmentLocation.vue'
import { apartment } from './guest-catalogue-fixtures'
import { ru } from '../guest/app/content/ru'
let wrapper: ReturnType<typeof mount> | undefined
let approach: () => void
const disconnect = vi.fn()
const Map = defineComponent({ props: { apartments: Array, hotelOnly: Boolean }, template: '<div class="test-location-map" :data-hotel-only="hotelOnly">{{ apartments[0].mapLocation.hotelName }}</div>' })
beforeEach(() => {
  disconnect.mockClear()
  vi.stubGlobal('useSite', () => ({ copy: computed(() => ru) }))
  for (const [key, value] of Object.entries({ computed, onBeforeUnmount, onMounted, ref, useTemplateRef })) vi.stubGlobal(key, value)
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { approach = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    observe() {}
    disconnect = disconnect
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals() })
it('waits until the location approaches the viewport and then displays only the current hotel', async () => {
  wrapper = mount(Location, { props: { apartment: { ...apartment('a'), location: 'Near the park' } }, global: { stubs: { CatalogueMap: Map, ClientOnly: { template: '<slot />' } } } })
  expect(wrapper.text()).toContain('Hotel')
  expect(wrapper.text()).toContain('Near the park')
  expect(wrapper.find('.test-location-map').exists()).toBe(false)
  approach(); await flushPromises()
  expect(wrapper.get('.test-location-map').text()).toBe('Hotel')
  expect(wrapper.get('.test-location-map').attributes('data-hotel-only')).toBe('true')
  expect(disconnect).toHaveBeenCalled()
})
it('keeps location text without displaying a map when coordinates are absent', async () => {
  wrapper = mount(Location, { props: { apartment: { ...apartment('a'), mapLocation: null, location: 'Bansko' } }, global: { stubs: { CatalogueMap: Map, ClientOnly: true } } })
  approach(); await flushPromises()
  expect(wrapper.text()).toContain('Bansko')
  expect(wrapper.find('.apartment-location-map').exists()).toBe(false)
})
