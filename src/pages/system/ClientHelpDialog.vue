<script setup lang="ts">
import type { ClientHelp } from '@contracts/client-help'
import { getCrmNavigation } from '#fsd/shared/auth'
import { CopyField, ResponsiveFormDialog } from '#fsd/shared/ui'

const props = defineProps<{ client: { id: string; name: string } }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const memberId = ref<string>()
const copying = ref<'copied' | 'failed'>()
const { data, status, error, refresh } = useAsyncData(
  `client-help:${props.client.id}`,
  (_app, { signal }) => $fetch<ClientHelp>(`/api/system/clients/${props.client.id}/help`, { signal }),
  { server: false }
)
const options = computed(() => data.value?.members.map(member => ({
  label: `${member.name} · ${member.roles.map(role => t(`roles.${role}`)).join(', ')}`,
  value: member.id
})) ?? [])
watch(options, items => {
  if (!items.some(item => item.value === memberId.value)) memberId.value = items[0]?.value
}, { immediate: true })
const member = computed(() => data.value?.members.find(item => item.id === memberId.value))
const agentStates = {
  inactive_account: 'Учётная запись не активна',
  organization_blocked: 'Организация заблокирована',
  no_permissions: 'У сотрудника нет прав для подключения',
  paused: 'Модуль приостановлен',
  not_connected: 'Нет действующего подключения',
  expired: 'Срок разрешения истёк',
  permissions_changed: 'Права изменились. Нужно подключиться заново',
  connected: 'Подключён'
}
const canOpenAgents = computed(() => member.value && ['not_connected', 'expired', 'permissions_changed', 'connected'].includes(member.value.agentState))
const navigation = computed(() => {
  if (!member.value || !data.value || member.value.status !== 'active' || member.value.agentState === 'organization_blocked') return []
  const { groups, settings } = getCrmNavigation({
    roles: member.value.roles, guestsEnabled: data.value.guestsEnabled, messagingEnabled: data.value.messagingEnabled
  }, t)
  return [
    ...groups,
    ...(settings.length ? [{ label: t('nav.settings'), items: settings }] : []),
    { label: t('account.menu'), items: [
      { to: '/profile', label: t('account.profile'), icon: 'i-lucide-user' },
      { to: '/security', label: t('account.security'), icon: 'i-lucide-shield-check' },
      { to: '/whats-new', label: t('account.whatsNew'), icon: 'i-lucide-newspaper' },
      ...(canOpenAgents.value ? [{ to: '/settings/ai-agents', label: t('aiAgents.title'), icon: 'i-lucide-bot' }] : [])
    ] }
  ]
})

async function copyLink() {
  if (!data.value) return
  try {
    await navigator.clipboard.writeText(data.value.settingsUrl)
    copying.value = 'copied'
  } catch {
    copying.value = 'failed'
  }
}
watch(memberId, () => { copying.value = undefined })
</script>

<template>
  <ResponsiveFormDialog :open="true" title="Помощь" :description="client.name" @update:open="open => { if (!open) emit('close') }">
    <template #body>
      <p v-if="status === 'pending' || status === 'idle'" role="status">Загрузка…</p>
      <div v-else-if="error" class="space-y-2">
        <UAlert color="error" description="Не удалось загрузить данные для помощи" />
        <UButton class="min-h-11" color="neutral" variant="outline" @click="refresh()">Повторить</UButton>
      </div>
      <p v-else-if="!options.length">У клиента пока нет сотрудников.</p>
      <div v-else class="space-y-4">
        <UFormField label="Сотрудник">
          <USelectMenu v-model="memberId" :items="options" value-key="value" class="min-h-11 w-full" />
        </UFormField>
        <section v-if="member" class="space-y-2 border-t border-[var(--color-line)] pt-3">
          <h2 class="font-semibold">ChatGPT</h2>
          <p class="text-sm">{{ agentStates[member.agentState] }}</p>
          <template v-if="canOpenAgents">
            <UFormField label="Ссылка для сотрудника">
              <CopyField :value="data?.settingsUrl" copy-label="Копировать ссылку для сотрудника" :copied="copying === 'copied'" @copy="copyLink" />
            </UFormField>
            <p v-if="copying" class="text-sm" role="status">
              {{ copying === 'copied' ? 'Ссылка скопирована.' : 'Скопируйте ссылку из поля вручную.' }}
            </p>
          </template>
        </section>
        <section class="space-y-2 border-t border-[var(--color-line)] pt-3">
          <h2 class="font-semibold">Что видит сотрудник</h2>
          <p v-if="!navigation.length" class="text-sm">Разделы CRM недоступны.</p>
          <div v-for="group in navigation" :key="group.items[0]?.to" class="space-y-1">
            <h3 v-if="group.label" class="text-sm font-medium">{{ group.label }}</h3>
            <ul class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--color-muted)]">
              <li v-for="item in group.items" :key="item.to" class="inline-flex items-center gap-1.5">
                <UIcon :name="item.icon" aria-hidden="true" />{{ item.label }}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </template>
  </ResponsiveFormDialog>
</template>
