<script setup lang="ts">
import { PageHeader } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
import { LanguageSwitcher } from '#fsd/features/change-language'
import { profileUpdateSchema } from '@contracts/platform'
import { useProfileName } from './model/profile-name'
import NotificationPreferencesPanel from './NotificationPreferencesPanel.vue'

const { t } = useI18n()
const user = useCurrentUser()
const { form, changed, accept } = useProfileName(user)
const pending = ref(false)
const error = ref('')
const notice = ref('')
const validation = useSubmitFormValidation()
const validate = createFormValidator(profileUpdateSchema, t)
const roles = computed(() => user.value?.roles.map(role => t(`roles.${role}`)).join(', ') ?? '')
watch(() => form.name, () => { error.value = ''; notice.value = '' })
async function save() {
  if (pending.value || !changed.value || !user.value) return
  const identity = user.value.id
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await $fetch('/api/users/me/profile', { method: 'PATCH', body: profileUpdateSchema.parse(form) })
    if (user.value?.id !== identity) return
    user.value = { ...user.value, name: result.name }
    accept(result.name)
    await nextTick()
    notice.value = t('account.nameSaved')
  } catch {
    error.value = t('account.profileSaveError')
  } finally { pending.value = false }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('account.profile')" />
    <div class="grid items-start gap-4 md:grid-cols-2">
      <section class="surface min-w-0 space-y-5 p-5 sm:p-6">
        <h2 class="text-lg font-semibold leading-6">{{ t('account.personalDetails') }}</h2>
        <UForm :key="validation.formKey.value" :state="form" :validate="validate" :validate-on="validation.validateOn.value" class="form-grid" novalidate @error="validation.onError" @submit="save">
          <UFormField name="name" :label="t('account.name')" required><UInput v-model="form.name" autocomplete="name" maxlength="200" class="w-full" :disabled="pending || !user" /></UFormField>
          <dl class="grid gap-4">
            <div class="space-y-1"><dt class="text-sm text-[var(--color-muted)]">{{ t('account.email') }}</dt><dd class="break-words text-sm">{{ user?.email || '—' }}</dd></div>
            <div class="space-y-1"><dt class="text-sm text-[var(--color-muted)]">{{ t('account.role') }}</dt><dd class="text-sm">{{ roles || '—' }}</dd></div>
          </dl>
          <UAlert v-if="error" color="error" :description="error" role="alert" />
          <UAlert v-if="notice" color="success" :description="notice" role="status" />
          <div class="form-actions form-actions--footer"><UButton type="submit" icon="i-lucide-check" class="ms-auto" :loading="pending" :disabled="pending || !changed || !user">{{ t('common.save') }}</UButton></div>
        </UForm>
      </section>
      <section class="surface min-w-0 space-y-5 p-5 sm:p-6">
        <h2 class="text-lg font-semibold leading-6">{{ t('common.language') }}</h2>
        <LanguageSwitcher labeled />
      </section>
    </div>
    <NotificationPreferencesPanel />
  </section>
</template>
