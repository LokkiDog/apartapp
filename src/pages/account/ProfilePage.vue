<script setup lang="ts">
import { PageHeader, DeleteConfirmModal } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
import { LanguageSwitcher } from '#fsd/features/change-language'
import { profileUpdateSchema } from '@contracts/platform'
import type { OwnProfile } from '@contracts/public-site'
import { useProfileName } from './model/profile-name'
import NotificationPreferencesPanel from './NotificationPreferencesPanel.vue'
const { t } = useI18n()
const user = useCurrentUser()
const identity = computed(() => user.value?.id ?? '')
const { data: profile, status, error: loadError, refresh } = await useAsyncData('own-profile', () => user.value ? $fetch<OwnProfile>('/api/users/me/profile') : Promise.resolve(null), { server: false, default: () => null, watch: [identity] })
const source = computed(() => user.value ? { id: user.value.id, name: profile.value?.name ?? user.value.name, phone: profile.value?.phone, publicBio: profile.value?.publicBio } : null)
const { form, changed, accept } = useProfileName(source)
const pending = ref(false)
const photoPending = ref(false)
const error = ref('')
const notice = ref('')
const deleteOpen = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const validation = useSubmitFormValidation()
const validate = createFormValidator(profileUpdateSchema, t)
const ready = computed(() => Boolean(user.value && profile.value && status.value === 'success'))
const photoUrl = computed(() => profile.value?.hasPhoto ? `/api/users/me/photo?v=${encodeURIComponent(profile.value.photoVersion)}` : undefined)
const roles = computed(() => user.value?.roles.map(role => t(`roles.${role}`)).join(', ') ?? '')
const languages = [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'English' }, { code: 'he', label: 'עברית' }, { code: 'bg', label: 'Български' }] as const
watch(identity, () => { profile.value = null; error.value = ''; notice.value = ''; deleteOpen.value = false })
async function save() {
  if (pending.value || photoPending.value || !changed.value || !ready.value) return
  const id = identity.value
  const input = profileUpdateSchema.parse(form)
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await $fetch('/api/users/me/profile', { method: 'PATCH', body: input })
    if (identity.value !== id || !user.value) return
    user.value = { ...user.value, name: result.name }
    accept(result.name, input.phone, input.publicBio)
    await refresh()
    if (identity.value === id) notice.value = t('account.nameSaved')
  } catch { if (identity.value === id) error.value = t('account.profileSaveError') }
  finally { pending.value = false }
}
function selectPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void changePhoto(file)
}
async function changePhoto(file: File | null) {
  if (photoPending.value || pending.value || !ready.value) return
  const id = identity.value
  if (file && file.size > 8 * 1024 * 1024) { error.value = t('profileDetails.photoLimit'); return }
  photoPending.value = true; error.value = ''; notice.value = ''
  try {
    let result: OwnProfile
    if (file) {
      const body = new FormData(); body.append('file', file)
      result = await $fetch<OwnProfile>('/api/users/me/photo', { method: 'POST', body })
    } else result = await $fetch<OwnProfile>('/api/users/me/photo', { method: 'DELETE' })
    if (identity.value !== id) return
    profile.value = result; deleteOpen.value = false
  } catch { if (identity.value === id) error.value = t('profileDetails.photoError') }
  finally { photoPending.value = false; if (fileInput.value) fileInput.value.value = '' }
}
</script>
<template>
  <section class="page-wrap space-y-4">
    <PageHeader :title="t('account.profile')" />
    <UAlert v-if="loadError" color="error" :description="t('common.error')"><template #actions><UButton class="min-h-11" @click="refresh()">{{ t('publication.retry') }}</UButton></template></UAlert>
    <div class="grid items-start gap-4 md:grid-cols-2">
      <section class="surface min-w-0 space-y-4 p-4 sm:p-5">
        <h2 class="text-lg font-semibold leading-6">{{ t('account.personalDetails') }}</h2>
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar :src="photoUrl" :alt="form.name" size="3xl" />
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" tabindex="-1" :aria-label="t('profileDetails.photo')" @change="selectPhoto">
          <UButton type="button" icon="i-lucide-camera" color="neutral" variant="outline" class="min-h-11" :loading="photoPending" :disabled="!ready || pending || photoPending" @click="fileInput?.click()">{{ t('profileDetails.photo') }}</UButton>
          <UButton v-if="profile?.hasPhoto" type="button" icon="i-lucide-trash-2" color="error" variant="ghost" class="min-h-11 min-w-11" :aria-label="t('profileDetails.deletePhoto')" :disabled="pending || photoPending" @click="deleteOpen = true" />
        </div>
        <UForm :key="validation.formKey.value" :state="form" :validate="validate" :validate-on="validation.validateOn.value" class="grid gap-4" novalidate @error="validation.onError" @submit="save">
          <UFormField name="name" :label="t('account.name')" required><UInput v-model="form.name" autocomplete="name" maxlength="200" class="w-full" :disabled="!ready || pending" /></UFormField>
          <UFormField name="phone" :label="t('profileDetails.phone')"><UInput v-model="form.phone" type="tel" autocomplete="tel" maxlength="40" placeholder="+359…" class="w-full" :disabled="!ready || pending" /></UFormField>
          <details class="border-t border-[var(--color-line)] pt-2">
            <summary class="flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-medium hover:bg-[var(--color-surface-muted)] active:bg-[var(--color-primary-soft)] focus-visible:outline-2">{{ t('profileDetails.description') }}</summary>
            <div class="grid gap-3 pt-2"><UFormField v-for="language in languages" :key="language.code" :name="`publicBio.${language.code}`" :label="language.label" class="w-full"><UTextarea v-model="form.publicBio[language.code]" :dir="language.code === 'he' ? 'rtl' : 'ltr'" maxlength="4000" :rows="3" class="w-full" :disabled="!ready || pending" /></UFormField></div>
          </details>
          <p class="text-sm text-[var(--color-muted)]">{{ t('profileDetails.publicHint') }}</p>
          <dl class="grid gap-3 sm:grid-cols-2"><div><dt class="text-sm text-[var(--color-muted)]">{{ t('account.email') }}</dt><dd class="break-words text-sm">{{ user?.email || '—' }}</dd></div><div><dt class="text-sm text-[var(--color-muted)]">{{ t('account.role') }}</dt><dd class="text-sm">{{ roles || '—' }}</dd></div></dl>
          <UAlert v-if="error" color="error" :description="error" role="alert" /><UAlert v-if="notice" color="success" :description="notice" role="status" />
          <div class="form-actions form-actions--footer"><UButton type="submit" icon="i-lucide-check" class="ms-auto min-h-11" :loading="pending" :disabled="pending || photoPending || !changed || !ready">{{ t('common.save') }}</UButton></div>
        </UForm>
      </section>
      <section class="surface min-w-0 space-y-4 p-4 sm:p-5"><h2 class="text-lg font-semibold leading-6">{{ t('common.language') }}</h2><LanguageSwitcher labeled /></section>
    </div>
    <NotificationPreferencesPanel />
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('profileDetails.deletePhoto')" :description="t('common.irreversible')" :loading="photoPending" :error="error" @confirm="changePhoto(null)" />
  </section>
</template>
