<script setup lang="ts">
import { ResponsiveFormDialog } from '#fsd/shared/ui'
import { onUnmounted } from 'vue'
import { z } from 'zod'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ changed: [email: string] }>()
const { t } = useI18n()
const email = ref('')
const password = ref('')
const destination = ref('')
const code = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const cooldownUntil = ref(0)
const now = ref(Date.now())
const canSend = computed(() => z.email().safeParse(email.value.trim()).success && Boolean(password.value))
const canConfirm = computed(() => /^\d{6}$/.test(code.value))
let timer: ReturnType<typeof setInterval> | undefined

watch(open, value => {
  if (value) {
    now.value = Date.now()
    timer = setInterval(() => { now.value = Date.now() }, 1000)
    return
  }
  clearInterval(timer)
  email.value = ''; password.value = ''; destination.value = ''; code.value = ''
  error.value = ''; notice.value = ''
})
watch(() => props.accountId, () => { open.value = false; cooldownUntil.value = 0 })
onUnmounted(() => clearInterval(timer))

function showError(cause: unknown) {
  const response = cause as { status?: number; data?: { data?: { code?: string } } }
  const key = response.data?.data?.code
  const keys: Record<string, string> = {
    INCORRECT_PASSWORD: 'passwordError', SAME_EMAIL: 'sameEmail', CODE_EXPIRED: 'expired',
    INVALID_CODE: 'invalidCode', MAIL_FAILED: 'mailFailed'
  }
  error.value = t(`emailChange.${key && keys[key] ? keys[key] : response.status === 409 ? 'emailUnavailable' : response.status === 429 ? 'rateLimit' : 'failed'}`)
  if (key === 'CODE_EXPIRED' || key === 'MAIL_FAILED') destination.value = ''
}

async function send(resend = false) {
  if (pending.value || (resend ? now.value < cooldownUntil.value : !canSend.value)) return
  const id = props.accountId
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await $fetch('/api/users/me/email/request', { method: 'POST', body: resend ? { resend: true } : { email: email.value.trim(), currentPassword: password.value } })
    if (id !== props.accountId || !open.value) return
    destination.value = result.email
    password.value = ''; code.value = ''
    cooldownUntil.value = Date.now() + 60_000
    if (resend) notice.value = t('emailChange.resent')
  } catch (cause) {
    if (id === props.accountId && open.value) showError(cause)
  } finally { pending.value = false }
}

async function submit() {
  if (!destination.value) return send()
  if (pending.value || !canConfirm.value) return
  const id = props.accountId
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await $fetch('/api/users/me/email/confirm', { method: 'POST', body: { code: code.value } })
    if (id !== props.accountId) return
    emit('changed', result.email)
    open.value = false
  } catch (cause) {
    if (id === props.accountId && open.value) showError(cause)
  } finally { pending.value = false }
}
</script>

<template>
  <ResponsiveFormDialog v-model:open="open" :title="t('emailChange.title')" :dismissible="!pending">
    <template #body>
      <form id="email-change-form" class="grid gap-3" @submit.prevent="submit">
        <template v-if="destination">
          <div>
            <p class="break-words font-medium">{{ t('emailChange.sent', { email: destination }) }}</p>
            <p class="text-sm text-muted">{{ t('emailChange.validity') }}</p>
          </div>
          <UFormField :label="t('emailChange.code')">
            <UInput v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" dir="ltr" class="min-h-11 w-full" :disabled="pending" />
          </UFormField>
          <UButton type="button" variant="link" class="min-h-11 justify-self-start px-0" :disabled="pending || now < cooldownUntil" @click="send(true)">{{ t('emailChange.resend') }}</UButton>
        </template>
        <template v-else>
          <UFormField :label="t('emailChange.newEmail')" required>
            <UInput v-model="email" type="email" autocomplete="email" maxlength="254" dir="ltr" class="min-h-11 w-full" :disabled="pending" />
          </UFormField>
          <UFormField :label="t('emailChange.currentPassword')" required>
            <UInput v-model="password" type="password" autocomplete="current-password" maxlength="1024" class="min-h-11 w-full" :disabled="pending" />
          </UFormField>
        </template>
        <UAlert v-if="error" color="error" :description="error" role="alert" />
        <UAlert v-if="notice" color="success" :description="notice" role="status" />
      </form>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer w-full">
        <UButton type="button" color="neutral" variant="outline" class="min-h-11" :disabled="pending" @click="open = false">{{ t('common.cancel') }}</UButton>
        <UButton type="submit" form="email-change-form" class="min-h-11" :loading="pending" :disabled="pending || (destination ? !canConfirm : !canSend)">{{ t(destination ? 'emailChange.confirm' : 'emailChange.send') }}</UButton>
      </div>
    </template>
  </ResponsiveFormDialog>
</template>
