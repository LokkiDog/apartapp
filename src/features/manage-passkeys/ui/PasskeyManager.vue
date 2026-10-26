<script setup lang="ts">
import type { AccountPasskey } from '@contracts/platform'
import { useCurrentUser } from '#fsd/shared/auth'
import { usePasskeys } from '#fsd/shared/lib'
import { DeleteConfirmModal } from '#fsd/shared/ui'
const emit = defineEmits<{ busy: [value: boolean] }>()
const { t } = useI18n()
const user = useCurrentUser()
const passkeys = usePasskeys()
const formId = useId()
const password = ref('')
const name = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const deleteTarget = ref<{ id: string; name: string } | null>(null)
const deleteOpen = ref(false)
const deletePending = ref(false)
const deleteError = ref('')
watch([pending, deletePending], () => emit('busy', pending.value || deletePending.value))
const { data: keys, refresh, status, error: loadError } = await useAsyncData<AccountPasskey[]>('account-passkeys', (): Promise<AccountPasskey[]> => user.value ? $fetch<AccountPasskey[]>('/api/auth/passkeys') : Promise.resolve([]), {
  server: false, default: () => [], watch: [user]
})
async function add() {
  if (pending.value) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await passkeys.register(password.value, name.value.trim() || t('passkeys.defaultName'))
    password.value = ''; name.value = ''; notice.value = t('passkeys.added')
    await refresh()
  } catch (cause: any) {
    error.value = cause?.name === 'NotAllowedError' || cause?.name === 'AbortError' ? t('passkeys.cancelled') : cause?.data?.statusMessage ?? t('passkeys.addError')
  } finally { password.value = ''; pending.value = false }
}
function askDelete(key: { id: string; name: string }) { deleteTarget.value = { ...key }; deleteError.value = ''; deleteOpen.value = true }
async function remove() {
  if (!deleteTarget.value || deletePending.value) return
  deletePending.value = true; deleteError.value = ''
  try {
    await $fetch(`/api/auth/passkeys/${encodeURIComponent(deleteTarget.value.id)}`, { method: 'DELETE' })
    deleteOpen.value = false; deleteTarget.value = null; await refresh()
  } catch { deleteError.value = t('passkeys.deleteError') }
  finally { deletePending.value = false }
}
</script>

<template>
  <div>
    <div class="space-y-4">
      <p class="text-sm leading-6 text-[var(--color-muted)]">{{ t('passkeys.description') }}</p>
      <UAlert v-if="loadError" color="error" :description="t('passkeys.loadError')"><template #actions><UButton color="neutral" variant="soft" class="min-h-11 cursor-pointer" @click="refresh()">{{ t('passkeys.retry') }}</UButton></template></UAlert>
      <p v-else-if="status === 'idle' || status === 'pending'" class="text-sm text-[var(--color-muted)]">{{ t('passkeys.loading') }}</p>
      <ul v-else-if="keys.length" class="divide-y divide-[var(--color-line)]">
        <li v-for="key in keys" :key="key.id" class="flex items-center justify-between gap-3 py-3">
          <span class="min-w-0 break-words text-sm font-medium">{{ key.name }}</span>
          <UButton color="error" variant="ghost" icon="i-lucide-trash-2" class="min-h-11 min-w-11 shrink-0 cursor-pointer" :aria-label="t('passkeys.deleteKey', { name: key.name })" @click="askDelete(key)" />
        </li>
      </ul>
      <p v-else class="text-sm text-[var(--color-muted)]">{{ t('passkeys.empty') }}</p>
      <form v-if="passkeys.supported.value" :id="formId" class="form-grid" @submit.prevent="add">
        <UFormField :label="t('passkeys.name')"><UInput v-model="name" :placeholder="t('passkeys.defaultName')" maxlength="80" class="w-full" :disabled="pending" /></UFormField>
        <UFormField :label="t('auth.password')" :help="t('passkeys.passwordHelp')"><UInput v-model="password" type="password" autocomplete="current-password" required maxlength="200" class="w-full" :disabled="pending" /></UFormField>
        <UAlert v-if="error" color="error" :description="error" />
        <UAlert v-if="notice" color="success" :description="notice" />
      </form>
      <UAlert v-else color="neutral" :description="t('passkeys.unsupported')" />
    </div>
    <div class="form-actions mt-4">
      <UButton v-if="passkeys.supported.value" type="submit" :form="formId" icon="i-lucide-plus" :loading="pending" :disabled="pending || !password">{{ t('passkeys.add') }}</UButton>
    </div>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('passkeys.deleteTitle')" :description="t('passkeys.deleteDescription', { name: deleteTarget?.name ?? '' })" :loading="deletePending" :error="deleteError" @confirm="remove" />
  </div>
</template>
