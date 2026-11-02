// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import SiteContact from '../guest/app/components/SiteContact.vue'
import EnquiryDialog from '../guest/app/components/ApartmentEnquiryDialog.vue'
import GuestDateRangeInput from '../guest/app/components/GuestDateRangeInput.vue'
import { useSite } from '../guest/app/composables/useSite'
import { useApartmentEnquiry } from '../guest/app/composables/useApartmentEnquiry'
import { validStayDates } from '../guest/shared/site'
import { ru } from '../guest/app/content/ru'
const route = reactive({ path: '/apartments/studio', params: { slug: 'studio' }, query: { lang: 'ru' } })
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  route.path = '/apartments/studio'; route.params.slug = 'studio'; route.query.lang = 'ru'
  const state = new Map<string, unknown>()
  vi.stubGlobal('useState', (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()))
    return state.get(key)
  })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useCookie', () => ref('ru'))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { whatsapp: '359888123456', siteUrl: 'https://example.test' } }))
  vi.stubGlobal('useSite', useSite)
  vi.stubGlobal('useApartmentEnquiry', useApartmentEnquiry)
  for (const [key, value] of Object.entries({ computed, ref, watch, useTemplateRef, nextTick, onBeforeUnmount })) vi.stubGlobal(key, value)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals() })
async function view(explicitApartment = true) {
  const Root = defineComponent({ components: { SiteContact, EnquiryDialog }, setup: () => ({ props: explicitApartment ? { title: 'Mountain studio', slug: 'studio' } : {} }), template: '<SiteContact v-bind="props" /><EnquiryDialog />' })
  wrapper = mount(Root, { attachTo: document.body, global: { components: { GuestDateRangeInput } } })
  return wrapper
}
function message() { return new URL(wrapper!.get('.enquiry-whatsapp').attributes('href')!).searchParams.get('text')! }
it('offers optional dates and keeps the apartment and link when continuing without them', async () => {
  const viewWrapper = await view()
  const trigger = viewWrapper.get('a.button')
  await trigger.trigger('click'); await flushPromises()
  expect(viewWrapper.get('dialog').attributes('open')).toBeDefined()
  expect(viewWrapper.get('#enquiry-hint').text()).toBe(ru.stayDatesHint)
  expect(message()).toContain('Mountain studio')
  expect(message()).toContain('https://example.test/apartments/studio?lang=ru')
  expect(message()).not.toContain(`${ru.contactDates}:`)
  await viewWrapper.get('.enquiry-whatsapp').trigger('click'); await flushPromises()
  expect(viewWrapper.get('dialog').attributes('open')).toBeUndefined()
  expect(document.activeElement).toBe(trigger.element)
})
it('blocks incomplete or reversed dates and includes a valid range in the WhatsApp message', async () => {
  const viewWrapper = await view()
  await viewWrapper.get('a.button').trigger('click'); await flushPromises()
  await viewWrapper.get('input[aria-label="Заезд"]').setValue('2027-01-20')
  const incomplete = new MouseEvent('click', { bubbles: true, cancelable: true })
  viewWrapper.get('.enquiry-whatsapp').element.dispatchEvent(incomplete); await flushPromises()
  expect(incomplete.defaultPrevented).toBe(true)
  expect(viewWrapper.get('[role="alert"]').text()).toBe(ru.stayDatesError)
  await viewWrapper.get('input[aria-label="Выезд"]').setValue('2027-01-19')
  const reversed = new MouseEvent('click', { bubbles: true, cancelable: true })
  viewWrapper.get('.enquiry-whatsapp').element.dispatchEvent(reversed); await flushPromises()
  expect(reversed.defaultPrevented).toBe(true)
  await viewWrapper.get('input[aria-label="Выезд"]').setValue('2027-01-21')
  expect(viewWrapper.find('[role="alert"]').exists()).toBe(false)
  expect(message()).toContain(`${ru.contactDates}:`)
  expect(message()).toMatch(/20.*2027.*21.*2027/s)
  expect(message()).toContain('Mountain studio')
  const valid = new MouseEvent('click', { bubbles: true, cancelable: true })
  viewWrapper.get('.enquiry-whatsapp').element.dispatchEvent(valid); await flushPromises()
  expect(valid.defaultPrevented).toBe(false)
  expect(viewWrapper.get('dialog').attributes('open')).toBeUndefined()
})
it('clears optional dates, preserves them for the same apartment and resets for another', async () => {
  const viewWrapper = await view()
  await viewWrapper.get('a.button').trigger('click'); await flushPromises()
  await viewWrapper.get('input[aria-label="Заезд"]').setValue('2027-02-01')
  await viewWrapper.get('input[aria-label="Выезд"]').setValue('2027-02-05')
  await viewWrapper.get('.enquiry-close').trigger('click'); await flushPromises()
  await viewWrapper.get('a.button').trigger('click'); await flushPromises()
  expect(viewWrapper.get('input[aria-label="Заезд"]').element.value).toBe('2027-02-01')
  await viewWrapper.get('.enquiry-clear').trigger('click')
  expect(message()).not.toContain(`${ru.contactDates}:`)
  await viewWrapper.get('input[aria-label="Заезд"]').setValue('2027-03-01')
  useApartmentEnquiry().request({ title: 'Another apartment', slug: 'another' }); await flushPromises()
  expect(viewWrapper.get('input[aria-label="Заезд"]').element.value).toBe('')
  expect(message()).toContain('Another apartment')
  expect(message()).toContain('/apartments/another?lang=ru')
})
it.each(['ru', 'en', 'he', 'bg'])('uses the apartment context for general contact buttons and preserves %s', async language => {
  route.query.lang = language
  useApartmentEnquiry().current.value = { title: 'Current apartment', slug: 'studio' }
  const viewWrapper = await view(false)
  await viewWrapper.get('a.button').trigger('click'); await flushPromises()
  expect(viewWrapper.get('dialog').attributes('open')).toBeDefined()
  expect(message()).toContain('Current apartment')
  expect(message()).toContain(`/apartments/studio?lang=${language}`)
  await viewWrapper.get('input[type="date"]').setValue('2027-05-10')
  await viewWrapper.findAll('input[type="date"]')[1]!.setValue('2027-05-12')
  expect(message()).toContain('2027')
})
it('keeps general contact outside the apartment page direct even after visiting an apartment', async () => {
  useApartmentEnquiry().current.value = { title: 'Previous apartment', slug: 'studio' }
  route.path = '/'; route.params.slug = ''
  const viewWrapper = await view(false)
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  viewWrapper.get('a.button').element.dispatchEvent(click); await flushPromises()
  expect(click.defaultPrevented).toBe(false)
  expect(viewWrapper.get('dialog').attributes('open')).toBeUndefined()
})
it.each([
  ['2027-02-01', '2027-02-01', false],
  ['2027-02-30', '2027-03-02', false], ['2028-02-29', '2028-03-01', true],
] as const)('validates the optional calendar range %s to %s', (start, end, valid) => {
  expect(validStayDates({ start, end })).toBe(valid)
})
