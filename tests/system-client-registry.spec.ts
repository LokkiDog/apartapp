// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, reactive, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import ClientsPage from '../src/pages/system/ClientsPage.vue'

vi.mock('#fsd/shared/auth', () => ({
  useCurrentUser: () => ref({ isSuperuser: true }),
  switchClientContext: vi.fn()
}))
vi.mock('#fsd/shared/ui', async () => ({
  ConfirmActionModal: { template: '<div />' },
  PageHeader: (await import('../src/shared/ui/PageHeader.vue')).default,
  EmptyState: (await import('../src/shared/ui/EmptyState.vue')).default,
  StatusBadge: (await import('../src/shared/ui/StatusBadge.vue')).default
}))

it('renders the client registry even when connection requests fail', async () => {
  const client = {
    id: 'first',
    name: 'Pirin Stay',
    timezone: 'Europe/Sofia',
    createdAt: '2026-11-07T15:00:00.000Z',
    status: 'active',
    messagingEnabled: true,
    administrators: [{ id: 'admin', name: 'Анна', email: 'admin@example.com', status: 'active' }]
  }
  const clients = ref<typeof client[]>([])
  vi.stubGlobal('useAsyncData', (key: string) => key === 'system-clients'
    ? { data: clients, status: computed(() => clients.value.length ? 'success' : 'idle'), error: ref(null) }
    : { data: ref([]), error: ref(new Error('Request failed')) })
  for (const [name, value] of Object.entries({ computed, reactive, ref, useToast: () => ({ add: vi.fn() }) })) {
    vi.stubGlobal(name, value)
  }
  const wrapper = mount({ components: { ClientsPage }, template: '<Suspense><ClientsPage /></Suspense>' }, {
    global: {
      stubs: {
        UAlert: { props: ['description'], template: '<div>{{ description }}</div>' },
        UBadge: true,
        UFormField: true,
        UButton: { template: '<button><slot /></button>' },
        UDropdownMenu: { template: '<div><slot /></div>' },
        UIcon: true,
        UInput: true,
        USelect: true,
        USkeleton: true,
        USlideover: true,
        USwitch: true
      }
    }
  })
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('Не удалось загрузить заявки на подключение')
    expect(wrapper.text()).not.toContain('Клиентов нет')
    clients.value = [client]
    await flushPromises()
    expect(wrapper.get('tbody tr').text()).toContain(client.name)
    expect(wrapper.get('ul[aria-label="Реестр клиентов"] li').text()).toContain(client.name)
  } finally {
    wrapper.unmount()
    vi.unstubAllGlobals()
  }
})
