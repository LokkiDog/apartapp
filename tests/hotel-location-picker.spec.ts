// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestHotelViewport } from '../src/entities/hotel/model/map-viewport'
import type { Hotel } from '../src/entities/hotel/model/hotel'
import HotelLocationMap from '../src/entities/hotel/ui/HotelLocationMap.vue'
import HotelLocationPicker from '../src/pages/hotels/ui/HotelLocationPicker.vue'

describe('initial hotel map', () => {
  it('uses the most recently created valid active hotel without changing list order', () => {
    const hotel: Hotel = {
      id: '1', name: 'Zulu', address: '', status: 'active',
      latitude: '13.02', longitude: '100.92', createdAt: '2026-10-05T12:00:00.000Z'
    }
    const hotels: Hotel[] = [
      { ...hotel, id: '2', name: 'Alpha', latitude: '41.83', createdAt: '2026-10-01T08:00:00.000Z' },
      hotel,
      { ...hotel, id: '3', status: 'archived', createdAt: '2026-10-08T08:00:00.000Z' },
      { ...hotel, id: '4', longitude: '200', createdAt: '2026-10-09T08:00:00.000Z' }
    ]
    expect(latestHotelViewport(hotels)).toEqual({ latitude: 13.02, longitude: 100.92, zoom: 14 })
    expect(hotels.map(item => item.id)).toEqual(['2', '1', '3', '4'])
    expect(latestHotelViewport(hotels.slice(2)).zoom).toBe(2)
  })
})

describe('hotel location picker', () => {
  const world = { latitude: 20, longitude: 0, zoom: 2 }
  const neighborhood = { latitude: 12.92, longitude: 100.88, zoom: 14 }
  let success: PositionCallback
  let failure: PositionErrorCallback
  const getCurrentPosition = vi.fn((resolve: PositionCallback, reject: PositionErrorCallback) => {
    success = resolve
    failure = reject
  })

  beforeEach(() => {
    getCurrentPosition.mockClear()
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    for (const [key, value] of Object.entries({ ref, shallowRef, watch, onBeforeUnmount })) vi.stubGlobal(key, value)
    vi.stubGlobal('$fetch', vi.fn())
    vi.stubGlobal('useFormField', () => ({
      emitFormFocus: vi.fn(), emitFormBlur: vi.fn(), emitFormInput: vi.fn(), emitFormChange: vi.fn()
    }))
  })

  afterEach(() => vi.unstubAllGlobals())

  function picker() {
    return mount(HotelLocationPicker, {
      props: { latitude: null, longitude: null, initialViewport: world },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: { hotels: { myLocation: 'My location', geolocation: { denied: 'Access denied' }, addressSearch: { find: 'Find', placeholder: 'Address or city', pending: 'Searching', attribution: 'Search by' } }, uiExtra: {} } } })],
        stubs: {
          HotelLocationMap: true,
          UFormField: { template: '<div><slot /></div>' },
          UButton: { template: '<button><slot /></button>' },
          UInput: { props: ['modelValue'], template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` }
        }
      }
    })
  }

  it('centers the map on explicit geolocation without emitting hotel coordinates', async () => {
    const wrapper = picker()
    try {
      const map = wrapper.getComponent(HotelLocationMap)
      expect(getCurrentPosition).not.toHaveBeenCalled()
      await wrapper.setProps({ initialViewport: neighborhood })
      expect(map.props('viewport')).toEqual(neighborhood)
      await wrapper.findAll('button').find(button => button.text() === 'My location')!.trigger('click')
      success({ coords: { latitude: 13, longitude: 101 } } as GeolocationPosition)
      await wrapper.vm.$nextTick()
      expect(map.props('viewport')).toEqual({ latitude: 13, longitude: 101, zoom: 16 })
      expect(wrapper.emitted('update:location')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps a manual selection when hotel data or a geolocation response arrives late', async () => {
    const wrapper = picker()
    try {
      const map = wrapper.getComponent(HotelLocationMap)
      await wrapper.findAll('button').find(button => button.text() === 'My location')!.trigger('click')
      const point = { latitude: 42.7, longitude: 23.3 }
      map.vm.$emit('update:location', point)
      await wrapper.setProps({ initialViewport: neighborhood, ...point })
      success({ coords: { latitude: 13, longitude: 101 } } as GeolocationPosition)
      await wrapper.vm.$nextTick()
      expect(map.props('viewport')).toEqual(world)
      expect(wrapper.emitted('update:location')).toEqual([[point]])
    } finally {
      wrapper.unmount()
    }
  })

  it('reports denied location and still accepts a map point', async () => {
    const wrapper = picker()
    try {
      await wrapper.findAll('button').find(button => button.text() === 'My location')!.trigger('click')
      failure({ code: 1 } as GeolocationPositionError)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[role="status"]').text()).toBe('Access denied')
      const point = { latitude: 13.02, longitude: 100.92 }
      wrapper.getComponent(HotelLocationMap).vm.$emit('update:location', point)
      expect(wrapper.emitted('update:location')).toEqual([[point]])
    } finally {
      wrapper.unmount()
    }
  })
  it('searches on submit, pans to a city and commits only a selected address', async () => {
    const wrapper = picker()
    const city = { address: 'Pattaya', latitude: 12.92, longitude: 100.88, attribution: 'OpenStreetMap', area: true }
    const building = { ...city, address: '12 Beach Road', area: false }
    vi.mocked($fetch).mockResolvedValue({ results: [city, building] })
    try {
      await wrapper.get('input').setValue('Pattaya')
      expect($fetch).not.toHaveBeenCalled()
      const click = (label: string) => wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
      await click('Find')
      await click('Pattaya')
      expect(wrapper.emitted('select-address')).toBeUndefined()
      expect(wrapper.getComponent(HotelLocationMap).props('viewport')).toEqual(neighborhood)
      await click('Find')
      await click('12 Beach Road')
      expect(wrapper.emitted('select-address')).toEqual([[building]])
      expect(wrapper.emitted('update:location')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

})
