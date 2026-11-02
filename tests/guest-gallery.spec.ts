// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { mount } from '@vue/test-utils'
import Gallery from '../guest/app/components/ApartmentGallery.vue'
import { ru } from '../guest/app/content/ru'
const rtl = ref(false)
let wrapper: ReturnType<typeof mount> | undefined
const photos = Array.from({ length: 7 }, (_, index) => ({ id: `photo-${index}`, url: `/photo-${index}.jpg` }))
function gallery(count = 7) {
  wrapper = mount(Gallery, { props: { title: 'Studio', photos: photos.slice(0, count) }, attachTo: document.body })
  return wrapper
}
beforeEach(() => {
  rtl.value = false
  vi.stubGlobal('useSite', () => ({ copy: computed(() => ru), isRtl: rtl }))
  for (const [key, value] of Object.entries({ computed, onBeforeUnmount, ref, useTemplateRef, watch })) vi.stubGlobal(key, value)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals() })
it.each([1, 2, 3, 4, 5, 7])('previews up to five distinct photos in CRM order with %i photos', count => {
  const view = gallery(count)
  expect(view.findAll('.gallery-tile img').map(image => image.attributes('src'))).toEqual(photos.slice(0, Math.min(count, 5)).map(photo => photo.url))
  expect(view.get('.gallery-mosaic').classes()).toContain(`gallery-mosaic--${Math.min(count, 5)}`)
  expect(view.find('.photo-viewer[open]').exists()).toBe(false)
})
it('opens the clicked image, reaches photos outside the preview, supports RTL keys and returns focus', async () => {
  const view = gallery()
  const tile = view.findAll('.gallery-tile-open')[4]!
  await tile.trigger('click')
  expect(view.get('.photo-viewer').attributes('open')).toBeDefined()
  expect(view.get('.photo-viewer-stage img').attributes('src')).toBe('/photo-4.jpg')
  await view.get(`button[aria-label="${ru.nextPhoto}"]`).trigger('click')
  expect(view.get('.photo-viewer-stage img').attributes('src')).toBe('/photo-5.jpg')
  rtl.value = true
  await view.get('.photo-viewer').trigger('keydown', { key: 'ArrowLeft' })
  expect(view.get('.photo-viewer-stage img').attributes('src')).toBe('/photo-6.jpg')
  expect(view.get('.photo-viewer-toolbar span').text()).toBe('7 / 7')
  await view.get(`button[aria-label="${ru.close}"]`).trigger('click')
  expect(document.activeElement).toBe(tile.element)
  await view.get('.gallery-show-all').trigger('click')
  expect(view.get('.photo-viewer-stage img').attributes('src')).toBe('/photo-0.jpg')
  await view.setProps({ photos: photos.slice(0, 2) })
  expect(view.find('.photo-viewer[open]').exists()).toBe(false)
})
it('retries individual preview and viewer failures without blocking the remaining images', async () => {
  const view = gallery(3)
  await view.get('.gallery-tile img').trigger('error')
  expect(view.get('.gallery-tile-error').text()).toContain(ru.photoError)
  await view.get('.gallery-tile-error button').trigger('click')
  expect(view.find('.gallery-tile-error').exists()).toBe(false)
  await view.get('.gallery-show-all').trigger('click')
  await view.get('.photo-viewer-stage img').trigger('error')
  expect(view.get('.photo-viewer-error').text()).toContain(ru.photoError)
  await view.get('.photo-viewer-error button').trigger('click')
  expect(view.get('.photo-viewer-stage img').attributes('src')).toBe('/photo-0.jpg')
  await view.get(`button[aria-label="${ru.nextPhoto}"]`).trigger('click')
  expect(view.get('.photo-viewer-stage img').attributes('src')).toBe('/photo-1.jpg')
})
