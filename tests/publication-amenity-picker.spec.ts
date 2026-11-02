// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import Picker from '../src/pages/apartments/PublicationAmenityPicker.vue'
import type { AmenityCode } from '../shared/contracts/publication'
import ru from '../i18n/locales/ru.json'
import en from '../i18n/locales/en.json'
import he from '../i18n/locales/he.json'
const Input = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">' })
const Checkbox = defineComponent({ props: ['modelValue', 'label', 'name'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :name="name" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>' })
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
function picker(locale = 'ru') {
  const selected = ref<AmenityCode[]>(['wifi'])
  const Root = defineComponent({ components: { Picker }, setup: () => ({ selected }), template: '<Picker v-model="selected" />' })
  wrapper = mount(Root, { global: { plugins: [createI18n({ legacy: false, locale, messages: { ru, en, he } })], stubs: { UInput: Input, UCheckbox: Checkbox } } })
  return { view: wrapper, selected }
}
it('searches translated names and preserves selection while selecting and removing amenities across searches', async () => {
  const { view, selected } = picker()
  const search = view.get('input[type="search"]')
  await search.setValue('посуд')
  expect(view.find('input[name="wifi"]').exists()).toBe(false)
  expect(view.get('input[name="dishwasher"]').exists()).toBe(true)
  await view.get('input[name="dishwasher"]').setValue(true)
  expect(selected.value).toEqual(['wifi', 'dishwasher'])
  await search.setValue('Wi-Fi')
  expect(view.get('input[name="wifi"]').element.checked).toBe(true)
  await view.get('input[name="wifi"]').setValue(false)
  await search.setValue('')
  expect(selected.value).toEqual(['dishwasher'])
  expect(view.get('input[name="dishwasher"]').element.checked).toBe(true)
  expect(view.get('.publication-amenities-count').text()).toBe('Выбрано: 1')
})
it('searches category names and reports no matches without changing the saved selection', async () => {
  const { view, selected } = picker()
  const search = view.get('input[type="search"]')
  await search.setValue('безопасность')
  expect(view.get('input[name="smoke_alarm"]').exists()).toBe(true)
  expect(view.find('input[name="tv"]').exists()).toBe(false)
  await search.setValue('несуществующее удобство')
  expect(view.findAll('input[type="checkbox"]')).toHaveLength(0)
  expect(view.get('[role="status"]').text()).toBe(ru.publication.noAmenityMatches)
  expect(selected.value).toEqual(['wifi'])
})
it('searches amenities in the current CRM language', async () => {
  const { view, selected } = picker('he')
  await view.get('input[type="search"]').setValue('מדיח')
  expect(view.findAll('input[type="checkbox"]')).toHaveLength(1)
  await view.get('input[name="dishwasher"]').setValue(true)
  expect(selected.value).toEqual(['wifi', 'dishwasher'])
})
