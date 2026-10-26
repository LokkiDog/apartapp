<script setup lang="ts">
import { PageHeader } from '#fsd/shared/ui'
import { PasskeyManager } from '#fsd/features/manage-passkeys'
import { changePasswordSchema } from '@contracts/platform'
import { usePasskeys } from '#fsd/shared/lib'

const { t } = useI18n()
const passkeys = usePasskeys()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
async function changePassword() {
  if (pending.value) return
  error.value = ''; notice.value = ''
  if (newPassword.value !== confirmation.value) { error.value = t('account.passwordMismatch'); return }
  const parsed = changePasswordSchema.safeParse({ currentPassword: currentPassword.value, newPassword: newPassword.value })
  if (!parsed.success) { error.value = t('account.passwordRequirements'); return }
  pending.value = true
  try {
    await $fetch('/api/auth/change-password', { method: 'POST', body: parsed.data })
    passkeys.offer.value = null
    currentPassword.value = ''; newPassword.value = ''; confirmation.value = ''
    notice.value = t('account.passwordChanged')
  } catch (cause: any) {
    const code = cause?.data?.data?.code
    error.value = code === 'INCORRECT_PASSWORD' ? t('account.incorrectPassword')
      : cause?.response?.status === 429 ? t('account.tooManyAttempts') : t('account.passwordChangeError')
  } finally { pending.value = false }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="$t('account.security')" />
    <div class="grid items-start gap-4 md:grid-cols-2">
      <section class="surface min-w-0 space-y-5 p-5 sm:p-6">
        <h2 class="text-lg font-semibold leading-6">{{ $t('passkeys.title') }}</h2>
        <PasskeyManager />
      </section>
      <section class="surface min-w-0 space-y-5 p-5 sm:p-6">
        <h2 class="text-lg font-semibold leading-6">{{ $t('account.changePassword') }}</h2>
        <form class="form-grid" @submit.prevent="changePassword">
          <UFormField :label="$t('account.currentPassword')"><UInput v-model="currentPassword" type="password" autocomplete="current-password" required maxlength="200" :disabled="pending" /></UFormField>
          <UFormField :label="$t('account.newPassword')" :help="$t('account.passwordRequirements')"><UInput v-model="newPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="200" :disabled="pending" /></UFormField>
          <UFormField :label="$t('account.confirmPassword')"><UInput v-model="confirmation" type="password" autocomplete="new-password" required minlength="8" maxlength="200" :disabled="pending" /></UFormField>
          <UAlert v-if="error" color="error" :description="error" role="alert" />
          <UAlert v-if="notice" color="success" :description="notice" role="status" />
          <div class="form-actions"><UButton type="submit" icon="i-lucide-lock-keyhole" :loading="pending" :disabled="pending">{{ $t('account.changePassword') }}</UButton></div>
        </form>
      </section>
    </div>
  </section>
</template>
