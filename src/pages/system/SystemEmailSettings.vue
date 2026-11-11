<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import type { SystemEmailCategory, SystemEmailPreferences } from '@contracts/system-notifications'

const user = useCurrentUser()
const identity = computed(() => user.value?.isSuperuser ? user.value.id : undefined)
const { data, refresh, status, error: loadError } = useAsyncData(
  'system-notification-email',
  () => identity.value ? $fetch<SystemEmailPreferences>('/api/system/notification-email') : Promise.resolve(null),
  { server: false, default: () => null, watch: [identity] }
)
const pending = ref<SystemEmailCategory | null>(null)
const error = ref('')
const options: Array<{ category: SystemEmailCategory; label: string }> = [
  { category: 'setup', label: 'Заявки на подключение Telegram и LINE' },
  { category: 'registration', label: 'Самостоятельная регистрация компании' },
  { category: 'invitationFailure', label: 'Ошибка отправки приглашения' }
]

async function update(category: SystemEmailCategory, enabled: boolean) {
  if (!data.value || status.value !== 'success' || pending.value || data.value[category] === enabled) return
  const userId = identity.value
  pending.value = category
  error.value = ''
  try {
    await $fetch('/api/system/notification-email', { method: 'PATCH', body: { category, enabled } })
    if (identity.value === userId && data.value) data.value = { ...data.value, [category]: enabled }
  } catch {
    error.value = 'Не удалось сохранить настройку email'
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <section aria-labelledby="system-email-heading" class="space-y-2">
    <h2 id="system-email-heading" class="font-semibold">Уведомления суперадмина</h2>
    <p class="text-sm text-[var(--color-muted)]">Выберите, какие уведомления дублировать на ваш email.</p>
    <UAlert v-if="loadError" color="error" role="alert" orientation="horizontal" description="Не удалось загрузить настройки email">
      <template #actions><UButton color="error" variant="ghost" @click="refresh()">Повторить</UButton></template>
    </UAlert>
    <div v-else-if="data" class="surface divide-y divide-[var(--color-line)]" :aria-busy="pending !== null">
      <USwitch
        v-for="{ category, label } in options"
        :key="category"
        :label="label"
        :model-value="data[category]"
        :loading="pending === category"
        :disabled="pending !== null || status !== 'success'"
        :ui="{ root: 'flex min-h-11 flex-row-reverse items-center justify-between gap-3 px-3 py-2 sm:px-4' }"
        @update:model-value="update(category, $event)"
      />
    </div>
    <USkeleton v-else-if="status === 'pending' || status === 'idle'" class="h-32 rounded-xl" aria-label="Загрузка настроек email" />
    <UAlert v-if="error" color="error" role="alert" :description="error" />
  </section>
</template>
