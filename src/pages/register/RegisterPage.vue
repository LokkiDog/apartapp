<script setup lang="ts">
import type { RegistrationSettings } from '@contracts/platform'
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const { data: settings, status, error: loadError } = await useAsyncData<RegistrationSettings>('registration-mode', (): Promise<RegistrationSettings> => $fetch<RegistrationSettings>('/api/auth/registration-mode'), { server: false })
const form = reactive({ companyName: '', name: '', email: '', password: '' })
const error = ref(''); const notice = ref(''); const pending = ref(false); const confirmed = ref(false); const submitted = ref(false)
async function submit() {
  pending.value = true; error.value = ''; notice.value = ''
  try { await $fetch('/api/auth/register', { method: 'POST', body: form }); submitted.value = true; notice.value = 'Письмо отправлено. Подтвердите email, чтобы создать компанию.' }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось завершить регистрацию. Если письмо не пришло, повторите отправку через минуту.' }
  finally { pending.value = false }
}
async function resend() {
  pending.value = true; error.value = ''
  try { await $fetch('/api/auth/resend-registration', { method: 'POST', body: { email: form.email } }); notice.value = 'Если email ожидает подтверждения, письмо отправлено.' }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось отправить письмо' }
  finally { pending.value = false }
}
async function confirm() {
  pending.value = true; error.value = ''
  try { await $fetch('/api/auth/confirm-registration', { method: 'POST', body: { token: token.value } }); confirmed.value = true; notice.value = 'Компания создана. Войдите с вашим email и паролем.'; await navigateTo('/register', { replace: true }) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось подтвердить email' }
  finally { pending.value = false }
}
</script>
<template>
  <div class="surface auth-card space-y-5">
    <h1 class="auth-card__title">{{ token ? 'Подтверждение email' : 'Регистрация компании' }}</h1>
    <UAlert v-if="error || loadError" color="error" :description="error || 'Не удалось загрузить настройки'" />
    <UAlert v-if="notice" color="success" :description="notice" />
    <p v-if="status === 'pending'">Загрузка…</p>
    <template v-else-if="confirmed"><UButton to="/login" class="min-h-11 cursor-pointer">Войти</UButton></template>
    <p v-else-if="settings?.registrationMode !== 'self_service'">Доступ только по приглашению. Обратитесь к администратору.</p>
    <UButton v-else-if="token" :loading="pending" class="min-h-11 cursor-pointer" @click="confirm">Подтвердить и создать компанию</UButton>
    <form v-else class="space-y-4" @submit.prevent="submit">
      <template v-if="!submitted">
        <UFormField label="Компания"><UInput v-model="form.companyName" required minlength="2" maxlength="200" class="w-full" /></UFormField>
        <UFormField label="Ваше имя"><UInput v-model="form.name" required minlength="2" maxlength="200" autocomplete="name" class="w-full" /></UFormField>
        <UFormField label="Email"><UInput v-model="form.email" required type="email" autocomplete="email" class="w-full" /></UFormField>
        <UFormField label="Пароль"><UInput v-model="form.password" required type="password" minlength="8" maxlength="200" autocomplete="new-password" class="w-full" /></UFormField>
        <UButton type="submit" :loading="pending" class="min-h-11 cursor-pointer">Зарегистрироваться</UButton>
      </template>
      <UButton type="button" color="neutral" variant="soft" :loading="pending" :disabled="!form.email" class="min-h-11 cursor-pointer" @click="resend">Повторить письмо</UButton>
    </form>
    <UButton to="/login" color="neutral" variant="link" class="min-h-11 cursor-pointer">К входу</UButton>
  </div>
</template>
