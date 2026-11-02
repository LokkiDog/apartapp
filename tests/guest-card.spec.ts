// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import ApartmentCard from '../guest/app/components/ApartmentCard.vue'
import { apartment } from './guest-catalogue-fixtures'
import { ru } from '../guest/app/content/ru'
import { readFileSync } from 'node:fs'
const catalogueStyles = readFileSync('guest/app/assets/catalogue.css', 'utf8')
const rtl = ref(false)
const Link = defineComponent({ props: ['to'], template: '<a :href="to"><slot /></a>' })
const wrappers: ReturnType<typeof mount>[] = []
function card(value = apartment('a104')) {
  const wrapper = mount(ApartmentCard, { props: { apartment: value }, global: { stubs: { NuxtLink: Link } } })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => { rtl.value = false; vi.stubGlobal('useSite', () => ({ copy: computed(() => ru), isRtl: rtl, localePath: (path: string) => `${path}?lang=ru` })) })
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.length = 0; vi.unstubAllGlobals() })
describe('in-card photo browsing', () => {
  it('keeps the initial and next photo visible without a load event or hovering', async () => {
    // SSR images can finish loading before hydration attaches the load listener.
    const style = document.createElement('style'); style.textContent = catalogueStyles
    document.head.append(style)
    const wrapper = card()
    document.body.append(wrapper.element)
    try {
      expect(Number(getComputedStyle(wrapper.get('img').element).opacity || '1')).toBe(1)
      await wrapper.get('button[aria-label="Следующее фото"]').trigger('click')
      expect(Number(getComputedStyle(wrapper.get('img').element).opacity || '1')).toBe(1)
    } finally { style.remove() }
  })

  it('keeps photos independent, clamps endpoints and links the photo and useful copy to the apartment', async () => {
    const first = card(); const second = card(apartment('b203'))
    const previous = first.get('button[aria-label="Предыдущее фото"]')
    const next = first.get('button[aria-label="Следующее фото"]')
    expect(previous.attributes('disabled')).toBeDefined()
    await next.trigger('click'); expect(first.get('img').attributes('src')).toBe('/two.jpg')
    expect(second.get('img').attributes('src')).toBe('/one.jpg')
    await next.trigger('click'); expect(next.attributes('disabled')).toBeDefined()
    await first.get('.card-photo-link').trigger('keydown', { key: 'ArrowRight' })
    expect(first.get('img').attributes('src')).toBe('/three.jpg')
    expect(first.findAll('a').map(link => link.attributes('href'))).toEqual(['/apartments/a104?lang=ru', '/apartments/a104?lang=ru'])
    expect(first.get('.card-description').text()).toContain('Балкон с видом на горы')
    expect(first.get('.card-hotel').text()).toBe('Hotel')
    await first.setProps({ apartment: { ...apartment('a104'), mapLocation: null } })
    expect(first.find('.card-hotel').exists()).toBe(false)
  })
  it('suppresses navigation after a horizontal swipe, leaves a normal click alone and respects RTL', async () => {
    const wrapper = card(); const gallery = wrapper.get('.card-gallery')
    await gallery.trigger('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 140, clientY: 20 })
    await gallery.trigger('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 25 })
    expect(wrapper.get('img').attributes('src')).toBe('/two.jpg')
    const swipeClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.get('a').element.dispatchEvent(swipeClick)
    expect(swipeClick.defaultPrevented).toBe(true)
    const normalClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.get('a').element.dispatchEvent(normalClick)
    expect(normalClick.defaultPrevented).toBe(false)
    rtl.value = true
    await gallery.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('img').attributes('src')).toBe('/three.jpg')
  })
  it('preserves vertical scrolling, handles image errors and hides controls for one photo', async () => {
    const wrapper = card(); const gallery = wrapper.get('.card-gallery')
    await gallery.trigger('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 140, clientY: 20 })
    await gallery.trigger('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 130, clientY: 120 })
    expect(wrapper.get('img').attributes('src')).toBe('/one.jpg')
    await wrapper.get('img').trigger('error'); expect(wrapper.get('[role="status"]').text()).toContain(ru.photoError)
    await wrapper.get('.card-photo-error button').trigger('click'); expect(wrapper.find('.card-photo-error').exists()).toBe(false)
    await wrapper.setProps({ apartment: { ...apartment('a104'), photos: [{ id: 'only', url: '/only.jpg' }] } })
    expect(wrapper.findAll('.card-photo-control')).toHaveLength(0)
    expect(wrapper.get('img').attributes('src')).toBe('/only.jpg')
  })
})
