<script setup lang="ts">
import type { RegistrationSettings } from '@contracts/platform'
import { usePasskeys } from '#fsd/shared/lib'
const passkeys = usePasskeys()
const passkeyPending = ref(false)
const { data: registration } = await useAsyncData<RegistrationSettings>('registration-mode', (): Promise<RegistrationSettings> => $fetch<RegistrationSettings>('/api/auth/registration-mode'), { server: false })
const email = ref(''); const password = ref(''); const error = ref(''); const pending = ref(false)
const { t, setLocale } = useI18n()
const route = useRoute()
const hydrated = ref(false)
const passwordVisible = ref(false)
const archivedNotice = computed(() => route.query.reason === 'blocked' ? t('auth.blockedClientNotice') : route.query.reason === 'archived' ? t('auth.archivedNotice') : '')
const loginForm = ref<HTMLFormElement | null>(null)
const resetOpen = ref(false); const resetEmail = ref(''); const resetNotice = ref(''); const resetPending = ref(false)
onMounted(() => { hydrated.value = true; const requested = route.query.lang; if (requested === 'ru' || requested === 'en' || requested === 'he') void setLocale(requested) })
async function login() {
  if (pending.value || passkeyPending.value) return
  pending.value = true; error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await useUserSession().fetch()
    const offerReady = passkeys.offerAfterLogin(password.value)
    password.value = ''
    await navigateTo((useUserSession().user.value as { isSuperuser?: boolean } | null)?.isSuperuser ? '/system/clients' : '/')
    await offerReady
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('auth.loginError') }
  finally { pending.value = false }
}
async function loginWithPasskey() {
  if (pending.value || passkeyPending.value) return
  passkeyPending.value = true; error.value = ''
  try {
    passkeys.offer.value = null
    await passkeys.authenticate()
    await useUserSession().fetch()
    await navigateTo((useUserSession().user.value as { isSuperuser?: boolean } | null)?.isSuperuser ? '/system/clients' : '/')
  } catch (cause: any) {
    error.value = t(cause?.name === 'NotAllowedError' || cause?.name === 'AbortError' ? 'passkeys.cancelled' : 'passkeys.loginError')
  } finally { passkeyPending.value = false }
}
function submitLoginOnEnter(event: KeyboardEvent) { if (event.isComposing || pending.value || passkeyPending.value || !hydrated.value) return; event.preventDefault(); loginForm.value?.requestSubmit() }
async function resetPassword() { resetPending.value = true; resetNotice.value = ''; try { await $fetch('/api/auth/request-password-reset', { method: 'POST', body: { email: resetEmail.value } }); resetNotice.value = t('auth.resetSent') } finally { resetPending.value = false } }
</script>
<template>
  <div class="w-full">
    <div class="surface auth-card auth-card--login">
      <h2 class="auth-card__title">{{ t('auth.welcome') }}</h2>
      <p class="auth-card__description">{{ t('auth.loginText') }}</p>
      <UAlert v-if="archivedNotice" class="mt-5" color="warning" variant="soft" icon="i-lucide-archive" :description="archivedNotice" />
      <form ref="loginForm" class="auth-login-form" @keydown.enter="submitLoginOnEnter" @submit.prevent="login">
        <UFormField :label="t('auth.email')" name="email">
          <UInput v-model="email" type="email" autocomplete="email" placeholder="name@example.com" class="w-full" size="xl" required />
        </UFormField>
        <UFormField :label="t('auth.password')" name="password" :ui="{ labelWrapper: 'auth-password-label' }">
          <template #hint>
            <UButton type="button" color="neutral" variant="link" class="auth-reset" @keydown.enter.stop @click="resetOpen = true">{{ t('auth.forgotPassword') }}</UButton>
          </template>
          <UInput v-model="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" placeholder="••••••••" class="w-full" size="xl" :ui="{ base: 'pe-12', trailing: 'pe-0' }" required>
            <template #trailing>
              <UButton type="button" color="neutral" variant="ghost" :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'" :aria-label="t(passwordVisible ? 'auth.hidePassword' : 'auth.showPassword')" :aria-pressed="passwordVisible" class="auth-password-toggle" @keydown.enter.stop @click="passwordVisible = !passwordVisible" />
            </template>
          </UInput>
        </UFormField>
        <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
        <UButton type="submit" block size="lg" class="auth-submit" :loading="pending" :disabled="!hydrated || pending || passkeyPending">{{ t('auth.login') }}</UButton>
      </form>
      <UButton v-if="passkeys.supported.value" type="button" block size="lg" color="neutral" variant="outline" icon="i-lucide-fingerprint" class="mt-4 min-h-11 cursor-pointer" :loading="passkeyPending" :disabled="pending || passkeyPending" @click="loginWithPasskey">{{ t('passkeys.login') }}</UButton>
      <UButton v-if="registration?.registrationMode === 'self_service'" to="/register" variant="link" class="mt-4 min-h-11 cursor-pointer">Регистрация</UButton>
      <p class="auth-card__access">{{ t('auth.accessNote') }}</p>
    </div>
    <UModal v-model:open="resetOpen" :title="t('auth.resetTitle')" :description="t('auth.resetDescription')">
      <template #body>
        <form id="password-reset-form" class="form-grid" @submit.prevent="resetPassword">
          <UFormField :label="t('auth.email')"><UInput v-model="resetEmail" type="email" autocomplete="email" class="w-full" required /></UFormField>
          <UAlert v-if="resetNotice" color="success" variant="soft" :description="resetNotice" />
        </form>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton type="button" color="neutral" variant="ghost" @click="resetOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton type="submit" form="password-reset-form" :loading="resetPending">{{ t('auth.sendLink') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
