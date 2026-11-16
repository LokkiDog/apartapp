<script setup lang="ts">
import { CopyField, PageHeader } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
import { emptyPublicBio, publicSiteColors, publicSiteInputSchema, publicSiteZone, socialLabels, type PublicContactKind, type PublicBio, type PublicSiteInput, type PublicSiteSettings } from '@contracts/public-site'
const { t } = useI18n()
const { public: { brand } } = useRuntimeConfig()
const user = useCurrentUser()
watch(user, value => { if (value && !value.roles.includes('administrator')) void navigateTo('/') }, { immediate: true })
const identity = computed(() => user.value ? `${user.value.organizationId}:${user.value.id}` : '')
const { data, status, error: loadError, refresh } = await useAsyncData('public-site-settings', () => user.value?.roles.includes('administrator') ? $fetch<PublicSiteSettings>('/api/public-site') : Promise.resolve(null), { server: false, default: () => null, watch: [identity] })
const emptyForm = () => publicSiteInputSchema.parse({ enabled: false, hostUserId: null })
const form = reactive<PublicSiteInput>(emptyForm())
const legacy = computed(() => Boolean(data.value?.settings.websiteUrl && !data.value.settings.slug))
const colorOptions = computed(() => publicSiteColors.map(value => ({ value, label: t(`siteSettings.colors.${value}`) })))
const siteAddress = computed(() => form.slug.trim() ? `https://${form.slug.trim().toLowerCase()}.${publicSiteZone}` : publicSiteZone)
const copied = ref(false)
const siteErrors: Record<string, string> = {
  SITE_ADDRESS_LOCKED: 'addressLocked', SITE_ADDRESS_UNAVAILABLE: 'addressUnavailable',
  SITE_PROFILE_REQUIRED: 'chooseProfile', SITE_DETAILS_REQUIRED: 'detailsRequired',
  SITE_WHATSAPP_REQUIRED: 'whatsappRequired', SITE_APARTMENT_REQUIRED: 'apartmentRequired'
}
const languages: { code: keyof PublicBio; label: string }[] = [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'English' }, { code: 'he', label: 'עברית' }, { code: 'bg', label: 'Български' }]
const descriptionLocale = ref<keyof PublicBio>('ru')
const saved = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const validation = useSubmitFormValidation()
const validate = createFormValidator(publicSiteInputSchema, t)
const changed = computed(() => JSON.stringify(form) !== saved.value)
function applySettings(settings: PublicSiteInput) {
  const state = { ...settings, hostDescription: { ...settings.hostDescription }, contactKinds: [...settings.contactKinds] }
  Object.assign(form, state)
  saved.value = JSON.stringify(state)
}
watch(data, value => {
  if (value && (!saved.value || !changed.value)) applySettings(value.settings)
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

async function copyAddress() {
  const address = data.value?.settings.websiteUrl
  if (!address) return
  try {
    await navigator.clipboard.writeText(address)
    copied.value = true
  } catch {
    error.value = t('common.error')
  }
}

async function save(enabled = form.enabled) {
  if (pending.value || (!changed.value && enabled === form.enabled)) return
  const current = identity.value
  const unpublishing = !enabled && form.enabled
  const unsaved = unpublishing && changed.value ? { ...form, enabled: false } : null
  const state = unpublishing ? data.value?.settings : form
  error.value = ''
  notice.value = ''
  const payload = publicSiteInputSchema.safeParse({ ...state, enabled })
  if (!payload.success) {
    error.value = validate({ ...state, enabled })[0]?.message || t('common.error')
    return
  }
  pending.value = true
  try {
    const result = await $fetch<PublicSiteSettings>('/api/public-site', { method: 'PUT', body: payload.data })
    if (identity.value !== current) return
    data.value = result
    applySettings(result.settings)
    if (unsaved) Object.assign(form, unsaved)
    copied.value = false
    notice.value = t('siteSettings.saved')
  } catch (cause: any) {
    const key = siteErrors[cause?.data?.data?.code]
    if (identity.value === current) error.value = key ? t(`siteSettings.${key}`) : t('common.error')
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <section class="page-wrap space-y-4">
    <PageHeader :title="t('siteSettings.title')" />
    <USkeleton v-if="status === 'pending' || status === 'idle'" class="h-64" />
    <UAlert v-else-if="loadError" color="error" orientation="horizontal" :description="t('common.error')"><template #actions><UButton color="error" variant="ghost" class="min-h-11" @click="refresh()">{{ t('publication.retry') }}</UButton></template></UAlert>
    <UAlert v-else-if="data && brand.id !== 'magicmop' && !legacy" :description="t('siteSettings.unavailable')" />
    <UForm v-else-if="data" :state="form" :validate="validate" :validate-on="validation.validateOn.value" class="surface grid max-w-3xl gap-4 p-4 sm:p-5" novalidate @error="validation.onError" @submit="save()">
      <template v-if="!legacy">
        <UFormField name="slug" :label="t('siteSettings.shortAddress')">
          <UInput v-model="form.slug" dir="ltr" placeholder="villa-rosa" maxlength="63" class="min-h-11 w-full" :disabled="pending" :readonly="data.addressLocked" />
          <template #help><bdi dir="ltr" class="break-all">{{ siteAddress }}</bdi></template>
        </UFormField>
        <UFormField name="title" :label="t('siteSettings.siteName')">
          <UInput v-model="form.title" maxlength="100" class="min-h-11 w-full" :disabled="pending" />
        </UFormField>
        <UFormField name="description" :label="t('profileDetails.description')">
          <UTextarea v-model="form.description" maxlength="1000" :rows="3" class="w-full" :disabled="pending" />
        </UFormField>
        <UFormField name="accent" :label="t('siteSettings.accent')">
          <USelect v-model="form.accent" :items="colorOptions" class="min-h-11 w-full" :disabled="pending" />
        </UFormField>
      </template>
      <UFormField v-if="data.settings.enabled || legacy" :label="t('siteSettings.address')">
        <CopyField :value="data.settings.websiteUrl" :copied="copied" :copy-label="t('siteSettings.copyAddress')" @copy="copyAddress" />
      </UFormField>
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
      <div class="form-actions form-actions--footer flex-wrap">
        <UButton v-if="data.settings.enabled" :to="data.settings.websiteUrl" target="_blank" rel="noopener noreferrer" color="neutral" variant="outline" class="min-h-11">{{ t('publication.openSite') }}</UButton>
        <UButton v-if="data.settings.enabled" type="button" color="neutral" variant="ghost" class="min-h-11" :disabled="pending" @click="save(false)">{{ t('siteSettings.unpublish') }}</UButton>
        <UButton type="submit" :color="form.enabled ? 'primary' : 'neutral'" variant="outline" class="ms-auto min-h-11" :loading="pending" :disabled="!changed">{{ t('common.save') }}</UButton>
        <UButton v-if="!data.settings.enabled" type="button" class="min-h-11" :loading="pending" @click="save(true)">{{ t('siteSettings.publish') }}</UButton>
      </div>
    </UForm>
  </section>
</template>
