// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import CatalogueMap from '../guest/app/components/CatalogueMap.client.vue'
import { apartment } from './guest-catalogue-fixtures'
import { ru } from '../guest/app/content/ru'
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.stubGlobal('useSite', () => ({ copy: computed(() => ru) }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('shows one marker per building, selects a member from a grouped popup and highlights its building', async () => {
  wrapper = mount(CatalogueMap, { props: { apartments: [apartment('a104'), apartment('b203'), apartment('c305', 'hotel-b')], highlighted: 'a104' }, attachTo: document.body })
  await vi.waitFor(() => expect(wrapper!.findAll('.catalogue-marker')).toHaveLength(2))
  expect(wrapper.findAll('.catalogue-marker--active')).toHaveLength(1)
  expect(wrapper.findAll('.catalogue-marker-label').map(marker => marker.text())).toEqual(['2', 'Hotel · C305'])
  await wrapper.get('.catalogue-marker').trigger('click')
  const options = wrapper.findAll('.map-apartment-list button')
  expect(options.map(option => option.text())).toEqual(['A104', 'B203'])
  await options[1]!.trigger('click')
  expect(wrapper.emitted('select')).toEqual([['b203']])
  await wrapper.findAll('.catalogue-marker')[1]!.trigger('click')
  expect(wrapper.emitted('select')?.[1]).toEqual(['c305'])
  expect(wrapper.get('.leaflet-control-attribution').text()).toContain('OpenStreetMap')
  await wrapper.setProps({ highlighted: 'c305' })
  expect(wrapper.findAll('.catalogue-marker')[1]!.classes()).toContain('catalogue-marker--active')
})
it('keeps the empty map informative without requesting tiles', async () => {
  wrapper = mount(CatalogueMap, { props: { apartments: [{ ...apartment('a104'), mapLocation: null }], highlighted: null } })
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toBe(ru.mapEmpty)
  expect(wrapper.find('.leaflet-tile-pane').exists()).toBe(false)
})

it('shows a recoverable tile error while retaining markers and accessible retry', async () => {
  wrapper = mount(CatalogueMap, { props: { apartments: [apartment('a104')], highlighted: null }, attachTo: document.body })
  await vi.waitFor(() => expect(wrapper!.find('img.leaflet-tile').exists()).toBe(true))
  await wrapper.get('img.leaflet-tile').trigger('error')
  expect(wrapper.get('.map-message').text()).toContain(ru.mapError)
  expect(wrapper.findAll('.catalogue-marker')).toHaveLength(1)
  await wrapper.get('.map-message button').trigger('click')
  expect(wrapper.find('.map-message').exists()).toBe(false)
})

it('initializes after the client-only placeholder is replaced by the real map container', async () => {
  // Nuxt's .client component renders a placeholder until its mounted hook;
  // the map's own mounted hook runs before that queued DOM update.
  const original = CatalogueMap as any
  const ClientOnlyMap = defineComponent({
    ...original,
    setup(props: any, context: any) {
      const clientMounted = ref(false)
      onMounted(() => { clientMounted.value = true })
      return Object.assign(original.setup(props, context), { clientMounted })
    },
    render(...args: any[]) {
      return args[3].clientMounted ? original.render.apply(this, args) : h('div')
    }
  })
  wrapper = mount(ClientOnlyMap, { props: { apartments: [apartment('a104')], highlighted: null }, attachTo: document.body })
  await vi.waitFor(() => expect(wrapper!.find('.catalogue-map-canvas.leaflet-container').exists()).toBe(true))
  expect(wrapper.findAll('.catalogue-marker')).toHaveLength(1)
  expect(wrapper.find('img.leaflet-tile').exists()).toBe(true)
})

it('shows an informative hotel marker without catalogue selection behavior in location mode', async () => {
  wrapper = mount(CatalogueMap, { props: { apartments: [apartment('a104')], highlighted: 'a104', hotelOnly: true }, attachTo: document.body })
  await vi.waitFor(() => expect(wrapper!.findAll('.catalogue-marker')).toHaveLength(1))
  const marker = wrapper.get('.catalogue-marker')
  expect(marker.text()).toBe('Hotel')
  expect(marker.attributes('role')).toBe('img')
  expect(marker.attributes('aria-label')).toBe('Hotel')
  expect(marker.attributes('aria-pressed')).toBeUndefined()
  await marker.trigger('click')
  expect(wrapper.emitted('select')).toBeUndefined()
})
