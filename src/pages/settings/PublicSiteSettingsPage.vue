<script setup lang="ts">
import { PageHeader } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
import { emptyPublicBio, publicSiteInputSchema, socialLabels, type PublicContactKind, type PublicBio, type PublicSiteInput, type PublicSiteSettings } from '@contracts/public-site'
const { t } = useI18n()
const user = useCurrentUser()
if (!user.value?.roles.includes('administrator')) await navigateTo('/')
const identity = computed(() => user.value ? `${user.value.organizationId}:${user.value.id}` : '')
const { data, status, error: loadError, refresh } = await useAsyncData('public-site-settings', () => user.value?.roles.includes('administrator') ? $fetch<PublicSiteSettings>('/api/public-site') : Promise.resolve(null), { server: false, default: () => null, watch: [identity] })
const emptyForm = () => ({ enabled: false, websiteUrl: '', hostUserId: null,
  hostDescription: emptyPublicBio(), contactKinds: [] as PublicContactKind[] })
const form = reactive<PublicSiteInput & { hostDescription: PublicBio; contactKinds: PublicContactKind[] }>(emptyForm())
const languages: { code: keyof PublicBio; label: string }[] = [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'English' }, { code: 'he', label: 'עברית' }, { code: 'bg', label: 'Български' }]
const descriptionLocale = ref<keyof PublicBio>('ru')
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
watch(identity, () => { saved.value = ''; Object.assign(form, emptyForm()); error.value = ''; notice.value = '' })
const profiles = computed(() => data.value?.profiles.map(profile => ({ label: profile.name, value: profile.id })) ?? [])
const selected = computed(() => data.value?.profiles.find(profile => profile.id === form.hostUserId))
const availableContacts = computed<PublicContactKind[]>(() => selected.value
  ? [...(selected.value.phone ? ['phone' as const] : []), ...selected.value.socials.map(channel => channel.platform)]
  : [])

function selectHost(id: string | undefined) {
  if (form.hostUserId === (id || null)) return
  form.hostUserId = id || null
  form.contactKinds = []
  form.hostDescription = emptyPublicBio()
}

function setContact(kind: PublicContactKind, enabled: boolean) {
  form.contactKinds = enabled ? [...new Set([...form.contactKinds, kind])] : form.contactKinds.filter(value => value !== kind)
}

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
    <UAlert v-else-if="loadError" color="error" orientation="horizontal" :description="t('common.error')"><template #actions><UButton color="error" variant="ghost" class="min-h-11" @click="refresh()">{{ t('publication.retry') }}</UButton></template></UAlert>
    <UForm v-else-if="data" :state="form" :validate="validate" :validate-on="validation.validateOn.value" class="surface grid max-w-3xl gap-4 p-4 sm:p-5" novalidate @error="validation.onError" @submit="save">
      <USwitch v-model="form.enabled" :label="t('siteSettings.enabled')" class="min-h-11" :disabled="pending" />
      <UFormField name="websiteUrl" :label="t('siteSettings.address')" required><UInput v-model="form.websiteUrl" type="url" placeholder="https://aparts-bansko.com" class="w-full" :disabled="pending" /></UFormField>
      <div class="grid gap-3 border-t border-[var(--color-line)] pt-3">
        <h2 class="text-lg font-semibold">{{ t('siteSettings.hostSection') }}</h2>
        <UFormField name="hostUserId" :label="t('siteSettings.profile')">
          <USelect :model-value="form.hostUserId ?? undefined" :items="profiles" :placeholder="t('siteSettings.chooseProfile')" class="min-h-11 w-full" :disabled="pending" @update:model-value="selectHost" />
        </UFormField>
        <template v-if="selected">
          <div class="grid gap-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">{{ t('profileDetails.description') }}</span>
              <USelect v-model="descriptionLocale" :items="languages" value-key="code" :aria-label="t('common.language')" class="min-h-11" :disabled="pending" />
            </div>
            <UFormField :name="`hostDescription.${descriptionLocale}`">
              <UTextarea :key="descriptionLocale" v-model="form.hostDescription[descriptionLocale]" :aria-label="t('profileDetails.description')" :dir="descriptionLocale === 'he' ? 'rtl' : 'ltr'" maxlength="4000" :rows="3" class="w-full" :disabled="pending" />
            </UFormField>
          </div>
          <fieldset class="min-w-0">
            <legend class="text-sm font-medium">{{ t('siteSettings.contacts') }}</legend>
            <div v-if="availableContacts.length" class="flex flex-wrap gap-x-4">
              <UCheckbox v-for="kind in availableContacts" :key="kind" :model-value="form.contactKinds.includes(kind)" :label="kind === 'phone' ? t('profileDetails.phone') : kind === 'other' ? t('profileDetails.otherChannel') : socialLabels[kind]" class="min-h-11 items-center" :disabled="pending" @update:model-value="setContact(kind, $event === true)" />
            </div>
            <p v-else class="mt-1 text-sm text-muted">{{ t('siteSettings.noContacts') }}</p>
          </fieldset>
        </template>
      </div>
      <UAlert v-if="error" color="error" :description="error" />
      <UAlert v-if="notice" color="success" :description="notice" />
      <div class="form-actions form-actions--footer"><UButton v-if="data.settings.enabled" :to="data.settings.websiteUrl" target="_blank" color="neutral" variant="outline" class="min-h-11">{{ t('publication.openSite') }}</UButton><UButton type="submit" class="ms-auto min-h-11" :loading="pending" :disabled="pending || !changed">{{ t('common.save') }}</UButton></div>
    </UForm>
  </section>
</template>
