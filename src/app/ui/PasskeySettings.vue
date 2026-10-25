<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { usePasskeys } from '#fsd/shared/lib'
import { DeleteConfirmModal } from '#fsd/shared/ui'

const { t } = useI18n()
const toast = useToast()
const user = useCurrentUser()
const passkeys = usePasskeys()
const open = ref(false)
const password = ref('')
const name = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const offerPending = ref(false)
const offerError = ref('')
const offerOpen = computed({
  get: () => Boolean(passkeys.supported.value && passkeys.offer.value?.userId === user.value?.id && passkeys.offer.value && !open.value),
  set: value => { if (!value && !offerPending.value) passkeys.postponeOffer() }
})
async function acceptOffer() {
  if (offerPending.value) return
  offerPending.value = true; offerError.value = ''
  try {
    if (await passkeys.acceptOffer(t('passkeys.defaultName'))) {
      toast.add({ title: t('passkeys.added'), color: 'success' })
    } else {
      open.value = true
    }
  } catch (cause: any) {
    if (cause?.name === 'NotAllowedError' || cause?.name === 'AbortError') {
      offerError.value = t('passkeys.cancelled')
    } else {
      passkeys.offer.value = null
      open.value = true
      await nextTick()
      error.value = t('passkeys.addError')
    }
  } finally { offerPending.value = false }
}
const deleteTarget = ref<{ id: string; name: string } | null>(null)
const deleteOpen = ref(false)
const deletePending = ref(false)
const deleteError = ref('')
const { data: keys, refresh, status, error: loadError } = await useAsyncData('account-passkeys', () => user.value && open.value ? $fetch('/api/auth/passkeys') : Promise.resolve([]), {
  server: false, default: () => [], watch: [user, open]
})
watch(open, () => { password.value = ''; error.value = ''; notice.value = ''; name.value = '' })
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
  <UButton color="neutral" variant="ghost" icon="i-lucide-fingerprint" class="min-h-11 min-w-11 cursor-pointer" :aria-label="t('passkeys.title')" @click="open = true" />
  <UModal v-model:open="offerOpen" :title="t('passkeys.offerTitle')" :dismissible="!offerPending">
    <template #body>
      <p class="text-sm leading-6 text-[var(--color-muted)]">{{ t('passkeys.offerDescription') }}</p>
      <UAlert v-if="offerError" color="error" variant="soft" :description="offerError" class="mt-4" />
    </template>
    <template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" :disabled="offerPending" @click="passkeys.postponeOffer()">{{ t('passkeys.later') }}</UButton><UButton icon="i-lucide-fingerprint" :loading="offerPending" :disabled="offerPending" @click="acceptOffer">{{ t('passkeys.create') }}</UButton></div></template>
  </UModal>
  <USlideover v-model:open="open" :title="t('passkeys.title')" :dismissible="!pending" :modal="true" :overlay="true">
    <template #body>
      <div class="space-y-6">
        <p class="text-sm leading-6 text-[var(--color-muted)]">{{ t('passkeys.description') }}</p>
        <UAlert v-if="loadError" color="error" :description="t('passkeys.loadError')"><template #actions><UButton color="neutral" variant="soft" class="min-h-11 cursor-pointer" @click="refresh()">{{ t('passkeys.retry') }}</UButton></template></UAlert>
        <p v-else-if="status === 'pending'" class="text-sm text-[var(--color-muted)]">{{ t('passkeys.loading') }}</p>
        <ul v-else-if="keys.length" class="divide-y divide-[var(--color-line)]">
          <li v-for="key in keys" :key="key.id" class="flex items-center justify-between gap-3 py-3">
            <span class="min-w-0 break-words text-sm font-medium">{{ key.name }}</span>
            <UButton color="error" variant="ghost" icon="i-lucide-trash-2" class="min-h-11 min-w-11 shrink-0 cursor-pointer" :aria-label="t('passkeys.deleteKey', { name: key.name })" @click="askDelete(key)" />
          </li>
        </ul>
        <p v-else class="text-sm text-[var(--color-muted)]">{{ t('passkeys.empty') }}</p>
        <form v-if="passkeys.supported.value" id="passkey-form" class="form-grid" @submit.prevent="add">
          <UFormField :label="t('passkeys.name')"><UInput v-model="name" :placeholder="t('passkeys.defaultName')" maxlength="80" class="w-full" :disabled="pending" /></UFormField>
          <UFormField :label="t('auth.password')" :help="t('passkeys.passwordHelp')"><UInput v-model="password" type="password" autocomplete="current-password" required maxlength="200" class="w-full" :disabled="pending" /></UFormField>
          <UAlert v-if="error" color="error" :description="error" />
          <UAlert v-if="notice" color="success" :description="notice" />
        </form>
        <UAlert v-else color="neutral" :description="t('passkeys.unsupported')" />
      </div>
    </template>
    <template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" :disabled="pending" @click="open = false">{{ t('common.close') }}</UButton><UButton v-if="passkeys.supported.value" type="submit" form="passkey-form" icon="i-lucide-plus" :loading="pending" :disabled="pending || !password">{{ t('passkeys.add') }}</UButton></div></template>
  </USlideover>
  <DeleteConfirmModal v-model:open="deleteOpen" :title="t('passkeys.deleteTitle')" :description="t('passkeys.deleteDescription', { name: deleteTarget?.name ?? '' })" :loading="deletePending" :error="deleteError" @confirm="remove" />
</template>
