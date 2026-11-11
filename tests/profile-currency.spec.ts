// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref, Suspense, useTemplateRef, watch } from 'vue'
import { createI18n, useI18n } from 'vue-i18n'
import { expect, it, vi } from 'vitest'
import ProfilePage from '../src/pages/account/ProfilePage.vue'
import ru from '../i18n/locales/ru.json'

vi.mock('#fsd/shared/auth', () => import('../src/shared/auth/session'))
vi.mock('#fsd/shared/lib', async () => ({
  ...await import('../src/shared/lib/use-money-format'),
  createFormValidator: () => () => [],
  useSubmitFormValidation: () => ({ formKey: ref(0), validateOn: ref([]) })
}))
vi.mock('#fsd/shared/ui', async () => ({
  ConfirmActionModal: (await import('../src/shared/ui/ConfirmActionModal.vue')).default,
  PageHeader: { template: '<div />' },
  DeleteConfirmModal: { template: '<div />' }
}))
vi.mock('#fsd/features/change-language', () => ({ LanguageSwitcher: { template: '<div />' } }))
vi.mock('../src/pages/account/NotificationPreferencesPanel.vue', () => ({ default: { template: '<div />' } }))

const Select = defineComponent({
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('select', {
      value: props.modelValue,
      onChange: (event: Event) => {
        const input = event.target as HTMLSelectElement
        emit('update:modelValue', input.value)
        input.value = props.modelValue
      }
    }, props.items.map((item: { value: string, label: string }) => h('option', { value: item.value }, item.label)))
  }
})

it('warns before saving, supports cancel and retry, and applies the confirmed currency', async () => {
  const session = ref({ user: { id: 'account', name: 'Admin', roles: ['administrator'] } })
  const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ currency: 'THB' })
  vi.stubGlobal('$fetch', save)
  vi.stubGlobal('useUserSession', () => ({ session, user: computed(() => session.value.user) }))
  vi.stubGlobal('useAsyncData', async () => ({ data: ref(null), status: ref('idle'), error: ref(null) }))
  for (const [name, value] of Object.entries({ computed, ref, useI18n, useTemplateRef, watch })) vi.stubGlobal(name, value)
  const wrapper = mount(defineComponent(() => () => h(Suspense, null, { default: () => h(ProfilePage) })), {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'ru', messages: { ru } })],
      stubs: {
        USelect: Select,
        UAvatar: true,
        UForm: { template: '<form><slot /></form>' },
        UFormField: { template: '<div><slot /></div>' },
        UInput: true,
        UTextarea: true,
        UModal: { props: ['open', 'title'], template: '<section v-if="open" role="dialog"><h2>{{ title }}</h2><slot name="body" /></section>' },
        UAlert: { props: ['description'], template: '<p role="alert">{{ description }}</p>' },
        UButton: { template: '<button><slot /></button>' }
      }
    }
  })

  try {
    await flushPromises()
    const select = wrapper.get('select')
    const dialog = () => wrapper.get('[role="dialog"]')
    await select.trigger('change')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await select.setValue('THB')
    expect(dialog().text()).toContain('Тайский бат')
    expect(dialog().text()).toContain('100,00\u00a0€ будет отображаться как 100,00\u00a0฿')
    expect(save).not.toHaveBeenCalled()
    await dialog().findAll('button')[0]!.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(session.value.user).not.toHaveProperty('currency')

    expect(select.element.value).toBe('EUR')
    await select.setValue('THB')
    await dialog().findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(dialog().get('[role="alert"]').text()).toBe(ru.profileCurrency.saveError)
    expect(session.value.user).not.toHaveProperty('currency')
    await dialog().findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith('/api/users/me/currency', { method: 'PATCH', body: { currency: 'THB' } })
    expect(session.value.user).toHaveProperty('currency', 'THB')
    expect(select.element.value).toBe('THB')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  } finally {
    wrapper.unmount()
    vi.unstubAllGlobals()
  }
})
