<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { PageHeader } from '#fsd/shared/ui'
import SystemEmailSettings from './SystemEmailSettings.vue'
import type { RegistrationMode, RegistrationSettings } from '@contracts/platform'

const user = useCurrentUser()
const { data, refresh, status, error: loadError } = useAsyncData<RegistrationSettings | null>('system-settings', () => user.value ? $fetch<RegistrationSettings>('/api/system/settings') : Promise.resolve(null), {
  server: false,
  default: () => null,
  watch: [user]
})
const pending = ref(false)
const error = ref('')
const notice = ref('')
const options: Array<{ value: RegistrationMode; label: string }> = [
  { value: 'superuser_only', label: 'По приглашению' },
  { value: 'self_service', label: 'Самостоятельно' }
]

async function selectMode(mode: RegistrationMode) {
  if (!data.value || status.value !== 'success' || pending.value || data.value.registrationMode === mode) return
  pending.value = true
  error.value = ''
  notice.value = ''
  try {
    data.value = await $fetch<RegistrationSettings>('/api/system/settings', { method: 'PATCH', body: { registrationMode: mode } })
    notice.value = 'Режим регистрации сохранён'
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить режим регистрации'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="space-y-5">
    <PageHeader title="Настройки системы" />
    <USkeleton v-if="!data && (status === 'idle' || status === 'pending')" class="h-[72px] w-full rounded-[10px]" aria-label="Загрузка настроек" />
    <UAlert v-else-if="loadError" description="Не удалось загрузить настройки" color="error" orientation="horizontal" role="alert">
      <template #actions><UButton color="error" variant="ghost" @click="refresh()">Повторить</UButton></template>
    </UAlert>
    <section v-else-if="data" aria-labelledby="system-client-settings" class="space-y-2">
      <h2 id="system-client-settings" class="font-semibold">Клиенты</h2>
      <div class="registration-row">
        <div class="min-w-0">
          <h3 id="registration-mode-label" class="text-sm font-semibold">Регистрация клиентов</h3>
          <p class="text-sm text-[var(--color-muted)]">Кто может создать компанию в CRM.</p>
        </div>
        <UFieldGroup role="group" aria-labelledby="registration-mode-label" :aria-busy="pending" class="registration-segments">
          <UButton
            v-for="option in options"
            :key="option.value"
            type="button"
            size="sm"
            class="registration-segment"
            :color="data.registrationMode === option.value ? 'primary' : 'neutral'"
            :variant="data.registrationMode === option.value ? 'solid' : 'ghost'"
            :aria-pressed="data.registrationMode === option.value"
            :disabled="pending || status !== 'success'"
            @click="selectMode(option.value)"
          >{{ option.label }}</UButton>
        </UFieldGroup>
      </div>
      <UAlert v-if="error" color="error" role="alert" :description="error" />
      <p v-if="data.registrationMode === 'self_service'" class="flex items-start gap-2 rounded-lg bg-[var(--tone-warning-bg)] px-3 py-2 text-sm leading-5 text-[var(--tone-warning-ink)]">
        <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>При отключении незавершённые регистрации нельзя будет подтвердить. Действующие клиенты сохранят доступ.</span>
      </p>
      <span class="sr-only" role="status">{{ pending ? 'Сохраняем режим регистрации' : notice }}</span>
    </section>
    <SystemEmailSettings />
  </section>
</template>

<style scoped>
.registration-row {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: var(--color-surface);
}

.registration-segments {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  border: 1px solid var(--color-line);
  border-radius: 9px;
}

.registration-segment {
  min-width: 0;
  min-height: 44px;
  justify-content: center;
  padding-inline: 0.5rem;
  border-radius: 0;
  font-size: 0.875rem;
  font-weight: 550;
  white-space: nowrap;
}

.registration-segment:first-child { border-start-start-radius: 8px; border-end-start-radius: 8px; }
.registration-segment:last-child { border-start-end-radius: 8px; border-end-end-radius: 8px; }
.registration-segment:active { scale: 1; }
.registration-segment:focus-visible { z-index: 1; }

@media (min-width: 640px) {
  .registration-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .registration-segments {
    flex: 0 0 clamp(17rem, 32vw, 27.5rem);
    width: auto;
  }
}
</style>
