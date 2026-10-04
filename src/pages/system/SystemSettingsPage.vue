<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { PageHeader } from '#fsd/shared/ui'
import type { RegistrationMode } from '@contracts/platform'

const user = useCurrentUser()
const { data, refresh, status, error: loadError } = await useAsyncData('system-settings', () => user.value ? $fetch('/api/system/settings') : Promise.resolve(null), {
  server: false,
  default: () => null,
  watch: [user]
})
const mode = ref<RegistrationMode>('superuser_only')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const options: Array<{ value: RegistrationMode; title: string; description: string; icon: string }> = [
  { value: 'superuser_only', title: 'Через суперпользователя', description: 'Вы создаёте клиента и приглашаете администратора.', icon: 'i-lucide-user-round-cog' },
  { value: 'self_service', title: 'Самостоятельно', description: 'Клиент создаёт компанию после подтверждения email.', icon: 'i-lucide-user-round-plus' }
]
const canSave = computed(() => Boolean(data.value) && status.value !== 'pending' && !pending.value && mode.value !== data.value?.registrationMode)
watch(() => data.value?.registrationMode, value => { if (value) mode.value = value }, { immediate: true })
watch(mode, () => { notice.value = ''; error.value = '' })

async function save() {
  if (!canSave.value) return
  pending.value = true
  error.value = ''
  notice.value = ''
  try {
    data.value = await $fetch('/api/system/settings', { method: 'PATCH', body: { registrationMode: mode.value } })
    notice.value = 'Настройки сохранены'
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <PageHeader title="Настройки системы" />
    <USkeleton v-if="status === 'pending' && !data" class="h-80 w-full max-w-3xl rounded-2xl" aria-label="Загрузка настроек" />
    <UAlert v-else-if="loadError" color="error" variant="soft" title="Не удалось загрузить настройки" class="max-w-3xl">
      <template #actions><UButton color="error" variant="soft" class="cursor-pointer" :loading="status === 'pending'" @click="refresh()">Повторить</UButton></template>
    </UAlert>
    <form v-else-if="data" class="surface w-full max-w-3xl overflow-hidden" :aria-busy="pending" @submit.prevent="save">
      <header class="flex items-start gap-3 p-5 sm:p-6">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-user-round-plus" class="size-5" /></span>
        <div class="min-w-0">
          <h2 class="text-lg font-semibold leading-6">Регистрация клиентов</h2>
          <p class="mt-1 text-pretty text-sm leading-5 text-[var(--color-muted)]">Выберите способ подключения новых компаний.</p>
        </div>
      </header>
      <div class="px-5 pb-5 sm:px-6 sm:pb-6">
        <URadioGroup
          v-model="mode"
          :items="options"
          label-key="title"
          name="registration-mode"
          legend="Способ регистрации клиентов"
          variant="card"
          :disabled="pending || status === 'pending'"
          :ui="{ legend: 'sr-only', fieldset: 'gap-3', item: 'registration-option', label: 'font-semibold', description: 'mt-1 text-pretty leading-5 text-[var(--color-muted)]' }"
          class="registration-options"
          :class="{ 'registration-options--disabled': pending || status === 'pending' }"
        >
          <template #label="{ item }"><span class="flex items-start gap-2"><UIcon :name="item.icon" class="size-5 shrink-0 text-[var(--color-muted)]" /><span>{{ item.title }}</span></span></template>
        </URadioGroup>
        <p class="mt-4 text-pretty text-sm leading-5 text-[var(--color-muted)]">Отключение самостоятельной регистрации закрывает и подтверждение начатых заявок. Действующие клиенты продолжают работать.</p>
        <UAlert v-if="error" color="error" variant="soft" :description="error" class="mt-4" role="alert" />
      </div>
      <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] px-5 py-4 sm:px-6">
        <p class="text-sm text-[var(--color-muted)]" aria-live="polite"><span v-if="notice" class="flex items-center gap-2 text-[var(--color-primary)]"><UIcon name="i-lucide-check" class="size-4" />{{ notice }}</span><span v-else-if="canSave">Есть несохранённые изменения</span><span v-else>Настройки применяются ко всей системе</span></p>
        <UButton type="submit" icon="i-lucide-check" :loading="pending" :disabled="!canSave" class="w-full cursor-pointer sm:w-auto">Сохранить</UButton>
      </footer>
    </form>
  </section>
</template>

<style scoped>
.registration-options :deep(.registration-option) {
  min-height: 44px;
  padding: 1rem;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--color-line);
  cursor: pointer;
  transition: background-color 150ms ease;
}
.registration-options :deep(.registration-option:hover) { background-color: var(--color-canvas); }
.registration-options :deep(.registration-option:active) { background-color: var(--color-primary-soft); }
.registration-options :deep(.registration-option:focus-within) { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.registration-options :deep(.registration-option:has([data-state="checked"])) { background-color: var(--color-primary-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent); }
.registration-options :deep(.registration-option:has([data-state="checked"]):hover) { background-color: color-mix(in srgb, var(--color-primary-soft) 80%, var(--color-line)); }
.registration-options--disabled :deep(.registration-option) { cursor: not-allowed; }
.registration-options--disabled :deep(.registration-option:hover) { background-color: inherit; }
.registration-options--disabled :deep(.registration-option:has([data-state="checked"]):hover) { background-color: var(--color-primary-soft); }
</style>
