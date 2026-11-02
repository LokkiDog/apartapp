<script setup lang="ts">
import { PageHeader } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
import { publicSiteInputSchema, type PublicSiteInput, type PublicSiteSettings } from '@contracts/public-site'
const { t } = useI18n()
const user = useCurrentUser()
if (!user.value?.roles.includes('administrator')) await navigateTo('/')
const identity = computed(() => user.value ? `${user.value.organizationId}:${user.value.id}` : '')
const { data, status, error: loadError, refresh } = await useAsyncData('public-site-settings', () => user.value?.roles.includes('administrator') ? $fetch<PublicSiteSettings>('/api/public-site') : Promise.resolve(null), { server: false, default: () => null, watch: [identity] })
const form = reactive<PublicSiteInput>({ enabled: false, websiteUrl: '', hostUserId: null })
const saved = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const validation = useSubmitFormValidation()
const validate = createFormValidator(publicSiteInputSchema, t)
const changed = computed(() => JSON.stringify(form) !== saved.value)
watch(data, value => {
  if (value && (!saved.value || !changed.value)) { Object.assign(form, value.settings); saved.value = JSON.stringify(form) }
}, { immediate: true })
watch(identity, () => { saved.value = ''; Object.assign(form, { enabled: false, websiteUrl: '', hostUserId: null }); error.value = ''; notice.value = '' })
const profiles = computed(() => data.value?.profiles.map(profile => ({ label: profile.name, value: profile.id })) ?? [])
const selected = computed(() => data.value?.profiles.find(profile => profile.id === form.hostUserId))
async function save() {
  if (pending.value || !changed.value) return
  const current = identity.value
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await $fetch<PublicSiteSettings>('/api/public-site', { method: 'PUT', body: publicSiteInputSchema.parse(form) })
    if (identity.value !== current) return
    data.value = result; Object.assign(form, result.settings); saved.value = JSON.stringify(form); notice.value = t('siteSettings.saved')
  } catch (cause: any) { if (identity.value === current) error.value = cause?.data?.statusMessage || t('common.error') }
  finally { pending.value = false }
}
</script>
<template>
  <section class="page-wrap space-y-4">
    <PageHeader :title="t('siteSettings.title')" />
    <USkeleton v-if="status === 'pending' || status === 'idle'" class="h-64" />
    <UAlert v-else-if="loadError" color="error" :description="t('common.error')"><template #actions><UButton class="min-h-11" @click="refresh()">{{ t('publication.retry') }}</UButton></template></UAlert>
    <UForm v-else-if="data" :state="form" :validate="validate" :validate-on="validation.validateOn.value" class="surface grid max-w-3xl gap-4 p-4 sm:p-5" novalidate @error="validation.onError" @submit="save">
      <USwitch v-model="form.enabled" :label="t('siteSettings.enabled')" class="min-h-11" :disabled="pending" />
      <UFormField name="websiteUrl" :label="t('siteSettings.address')" required><UInput v-model="form.websiteUrl" type="url" placeholder="https://aparts-bansko.com" class="w-full" :disabled="pending" /></UFormField>
      <UFormField name="hostUserId" :label="t('siteSettings.profile')" :description="t('siteSettings.publicFields')"><USelect :model-value="form.hostUserId ?? undefined" @update:model-value="value => form.hostUserId = value || null" :items="profiles" :placeholder="t('siteSettings.chooseProfile')" class="w-full" :disabled="pending" /></UFormField>
      <p v-if="selected" class="text-sm text-[var(--color-muted)]">{{ selected.phone || t('siteSettings.missingPhone') }}</p>
      <UButton to="/profile" color="neutral" variant="link" class="min-h-11 justify-self-start px-0">{{ t('siteSettings.editProfile') }}</UButton>
      <UAlert v-if="error" color="error" :description="error" />
      <UAlert v-if="notice" color="success" :description="notice" />
      <div class="form-actions form-actions--footer"><UButton v-if="data.settings.enabled" :to="data.settings.websiteUrl" target="_blank" color="neutral" variant="outline" class="min-h-11">{{ t('publication.openSite') }}</UButton><UButton type="submit" class="ms-auto min-h-11" :loading="pending" :disabled="pending || !changed">{{ t('common.save') }}</UButton></div>
    </UForm>
  </section>
</template>
