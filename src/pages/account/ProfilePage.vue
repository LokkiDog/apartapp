<script setup lang="ts">
import { ConfirmActionModal, PageHeader, DeleteConfirmModal } from '#fsd/shared/ui'
import { canConnectAiAgents, useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useMoneyFormat, useSubmitFormValidation } from '#fsd/shared/lib'
import { LanguageSwitcher } from '#fsd/features/change-language'
import { PasskeyManager } from '#fsd/features/manage-passkeys'
import { currencies, type Currency } from '@contracts/currency'
import { profileUpdateSchema } from '@contracts/platform'
import { socialContactSchema, socialLabels, socialPlatforms, type OwnProfile, type SocialContact } from '@contracts/public-site'
import ChangeEmailDialog from './ChangeEmailDialog.vue'
import { formatProfilePhone, maskProfilePhoneEdit } from './model/phone-mask'
import { useProfileName } from './model/profile-name'
import AiAgentConnectionPanel from './AiAgentConnectionPanel.vue'
import ChangePasswordForm from './ChangePasswordForm.vue'
import NotificationPreferencesPanel from './NotificationPreferencesPanel.vue'
defineProps<{ system?: boolean }>()

const { t } = useI18n()
const user = useCurrentUser()
const { session } = useUserSession()
const identity = computed(() => user.value?.id ?? '')
const { data: profile, status, error: loadError, refresh } = await useAsyncData('own-profile', () => user.value ? $fetch<OwnProfile>('/api/users/me/profile') : Promise.resolve(null), { server: false, default: () => null, watch: [identity] })
const source = computed(() => user.value ? { id: user.value.id, name: profile.value?.name ?? user.value.name, phone: formatProfilePhone(profile.value?.phone ?? ''), socials: profile.value?.socials } : null)
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
const emailOpen = ref(false)
const editing = ref<number | null>(null)
const draft = ref<SocialContact>({ platform: 'whatsapp', value: '' })
const socialIcons: Record<SocialContact['platform'], string> = {
  whatsapp: 'i-lucide-message-circle', telegram: 'i-lucide-send', instagram: 'i-lucide-instagram',
  line: 'i-lucide-message-square', facebook: 'i-lucide-facebook', viber: 'i-lucide-phone', other: 'i-lucide-link'
}
const socialLabel = (platform: SocialContact['platform']) => platform === 'other' ? t('profileDetails.otherChannel') : socialLabels[platform]
const platformOptions = computed(() => socialPlatforms
  .filter(platform => !form.socials.some((channel, index) => channel.platform === platform && index !== editing.value))
  .map(value => ({ value, label: socialLabel(value) })))
const channelValid = computed(() => socialContactSchema.safeParse(draft.value).success)
function editChannel(index: number) {
  editing.value = index
  draft.value = form.socials[index] ? { ...form.socials[index] } : { platform: platformOptions.value[0]!.value, value: '' }
}
function acceptChannel() {
  const result = socialContactSchema.safeParse(draft.value)
  if (!result.success || editing.value === null) return
  form.socials.splice(editing.value, 1, result.data)
  editing.value = null
}
function updateEmail(email: string) {
  if (!user.value) return
  user.value = { ...user.value, email }
  error.value = ''
  notice.value = t('emailChange.changed')
}
const { currency, formatMoney } = useMoneyFormat()
const currencyOptions = computed(() => currencies.map(value => ({ value, label: t(`profileCurrency.${value}`) })))
const nextCurrency = ref<Currency | null>(null)
const currencyPending = ref(false)
const currencyError = ref('')
const currencyDialogOpen = computed({
  get: () => nextCurrency.value !== null,
  set: open => { if (!open) nextCurrency.value = null }
})
const currencyWarning = computed(() => nextCurrency.value ? t('profileCurrency.warning', {
  from: formatMoney(100),
  to: formatMoney(100, nextCurrency.value)
}) : '')

function selectCurrency(value: Currency) {
  if (!user.value || currencyPending.value || value === currency.value) return
  currencyError.value = ''
  nextCurrency.value = value
}

async function saveCurrency() {
  const id = user.value?.id
  const target = nextCurrency.value
  if (!id || !target || currencyPending.value) return
  currencyPending.value = true
  currencyError.value = ''
  try {
    const result = await $fetch('/api/users/me/currency', { method: 'PATCH', body: { currency: target } })
    if (user.value?.id !== id || !session.value) return
    session.value = { ...session.value, user: { ...user.value, currency: result.currency } }
    nextCurrency.value = null
  } catch {
    if (user.value?.id === id) currencyError.value = t('profileCurrency.saveError')
  } finally {
    currencyPending.value = false
  }
}

watch(identity, () => { editing.value = null; profile.value = null; error.value = ''; notice.value = ''; deleteOpen.value = false; nextCurrency.value = null })
async function save() {
  if (pending.value || photoPending.value || !changed.value || editing.value !== null || !ready.value) return
  const id = identity.value
  const input = profileUpdateSchema.parse(form)
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await $fetch('/api/users/me/profile', { method: 'PATCH', body: input })
    if (identity.value !== id || !user.value) return
    user.value = { ...user.value, name: result.name }
    accept(result.name, input.phone, input.socials)
    await refresh()
    if (identity.value === id) notice.value = t('account.nameSaved')
  } catch { if (identity.value === id) error.value = t('account.profileSaveError') }
  finally { pending.value = false }
}
function maskPhoneInput(event: Event) {
  if ((event as InputEvent).isComposing) return
  const input = event.target as HTMLInputElement
  const cursor = input.selectionStart ?? input.value.length
  const masked = maskProfilePhoneEdit(form.phone, input.value, cursor, (event as InputEvent).inputType)
  if (masked.value === input.value && masked.cursor === cursor) return
  input.value = masked.value
  input.setSelectionRange(masked.cursor, masked.cursor)
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
    <UAlert v-if="loadError" color="error" orientation="horizontal" :description="t('common.error')"><template #actions><UButton color="error" variant="ghost" class="min-h-11" @click="refresh()">{{ t('publication.retry') }}</UButton></template></UAlert>
    <div class="grid items-start gap-4 md:grid-cols-2">
      <section class="surface min-w-0 space-y-4 p-4 sm:p-5">
        <h2 class="text-lg font-semibold leading-6">{{ t('account.personalDetails') }}</h2>
        <UForm :key="validation.formKey.value" :state="form" :validate="validate" :validate-on="validation.validateOn.value" class="grid gap-3" novalidate @error="validation.onError" @submit="save">
          <div class="flex items-center gap-3">
            <div class="relative shrink-0 pb-2 pe-2">
              <UAvatar :src="photoUrl" :alt="form.name" size="3xl" class="size-[72px]" />
              <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" tabindex="-1" :aria-label="t('profileDetails.photo')" @change="selectPhoto">
              <UButton type="button" icon="i-lucide-camera" color="neutral" variant="outline" class="absolute -bottom-1 -end-1 size-11 justify-center rounded-full bg-[var(--color-surface)]" :aria-label="t('profileDetails.photo')" :loading="photoPending" :disabled="!ready || pending || photoPending" @click="fileInput?.click()" />
            </div>
            <UFormField name="name" :label="t('account.name')" required class="min-w-0 flex-1"><UInput v-model="form.name" autocomplete="name" maxlength="200" class="min-h-11 w-full" :disabled="!ready || pending" /></UFormField>
            <UButton v-if="profile?.hasPhoto" type="button" icon="i-lucide-trash-2" color="neutral" variant="ghost" class="mt-5 size-11 justify-center" :aria-label="t('profileDetails.deletePhoto')" :disabled="pending || photoPending" @click="deleteOpen = true" />
          </div>
          <UFormField name="phone" :label="t('profileDetails.phone')"><UInput v-model="form.phone" type="tel" dir="ltr" @input.capture="maskPhoneInput" autocomplete="tel" maxlength="40" placeholder="+7…" class="min-h-11 w-full" :disabled="!ready || pending" /></UFormField>
          <div class="space-y-1">
            <h3 class="text-sm font-medium">{{ t('profileDetails.socials') }}</h3>
            <ul v-if="form.socials.length" class="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] px-2">
              <li v-for="(channel, index) in form.socials" :key="channel.platform" class="flex min-h-11 min-w-0 items-center gap-2 ps-1 text-sm">
                <UIcon :name="socialIcons[channel.platform]" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="shrink-0 font-medium">{{ socialLabel(channel.platform) }}</span>
                <span class="min-w-0 flex-1 truncate text-muted" dir="ltr" :title="channel.value">{{ channel.value }}</span>
                <UDropdownMenu :items="[
                  { label: t('emailChange.edit'), icon: 'i-lucide-pencil', onSelect: () => editChannel(index) },
                  { label: t('common.delete'), icon: 'i-lucide-trash-2', onSelect: () => form.socials.splice(index, 1) }
                ]">
                  <UButton type="button" icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="size-11 justify-center" :aria-label="socialLabel(channel.platform)" :disabled="editing !== null || pending" />
                </UDropdownMenu>
              </li>
            </ul>
            <div v-if="editing !== null" class="grid gap-2 pt-1">
              <USelect v-model="draft.platform" :items="platformOptions" class="min-h-11 w-full" :aria-label="t('profileDetails.socials')" @update:model-value="draft.value = ''" />
              <div class="flex min-w-0 items-center gap-2">
                <UInput v-model="draft.value" :type="draft.platform === 'whatsapp' ? 'tel' : 'text'" :placeholder="draft.platform === 'whatsapp' ? '+7…' : draft.platform === 'telegram' ? '@username / https://…' : 'https://…'" dir="ltr" class="min-h-11 min-w-0 flex-1" :aria-label="socialLabel(draft.platform)" />
                <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" class="min-h-11 min-w-11 shrink-0 justify-center" :aria-label="t('common.cancel')" :title="t('common.cancel')" @click="editing = null"><span class="sr-only lg:not-sr-only">{{ t('common.cancel') }}</span></UButton>
                <UButton type="button" icon="i-lucide-check" color="neutral" variant="outline" class="min-h-11 min-w-11 shrink-0 justify-center" :aria-label="t('profileDetails.applyChannel')" :title="t('profileDetails.applyChannel')" :disabled="!channelValid" @click="acceptChannel"><span class="sr-only lg:not-sr-only">{{ t('profileDetails.applyChannel') }}</span></UButton>
              </div>
            </div>
            <UButton v-else-if="platformOptions.length" type="button" icon="i-lucide-plus" color="neutral" variant="ghost" class="min-h-11" :disabled="!ready || pending" @click="editChannel(form.socials.length)">{{ t('profileDetails.addChannel') }}</UButton>
          </div>
          <UAlert v-if="error" color="error" :description="error" role="alert" />
          <UAlert v-if="notice" color="success" :description="notice" role="status" />
          <div class="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-[var(--color-line)] pt-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-x-2 text-sm">
                <span class="break-all" dir="ltr">{{ user?.email || '—' }}</span>
                <UButton type="button" icon="i-lucide-pencil" color="neutral" variant="ghost" class="min-h-11" :disabled="!user" @click="emailOpen = true">{{ t('emailChange.edit') }}</UButton>
              </div>
              <p class="text-sm text-muted">{{ roles || '—' }}</p>
            </div>
            <UButton type="submit" icon="i-lucide-check" class="ms-auto min-h-11" :loading="pending" :disabled="pending || photoPending || !changed || editing !== null || !ready">{{ t('common.save') }}</UButton>
          </div>
        </UForm>
      </section>
      <div class="grid min-w-0 gap-4">
        <section class="surface grid min-w-0 grid-cols-2 items-start gap-4 p-4 sm:p-5">
          <div class="min-w-0 space-y-2">
            <h2 class="text-lg font-semibold leading-6">{{ t('common.language') }}</h2>
            <LanguageSwitcher labeled class="min-h-11" />
          </div>
          <UFormField :label="t('profileCurrency.label')" class="min-w-0" :ui="{ label: 'text-lg font-semibold leading-6', container: 'mt-2' }">
            <USelect :model-value="currency" :items="currencyOptions" :disabled="!user || currencyPending" class="min-h-11 w-full cursor-pointer" @update:model-value="selectCurrency">
              {{ currency }}
            </USelect>
          </UFormField>
        </section>
        <AiAgentConnectionPanel v-if="!system && canConnectAiAgents(user)" />
      </div>
    </div>
    <section v-if="system" class="surface space-y-3 p-4 sm:p-5">
      <h2 class="text-lg font-semibold leading-6">{{ t('account.security') }}</h2>
      <div class="grid items-start gap-4 md:grid-cols-2">
        <div class="min-w-0 space-y-3">
          <h3 class="text-sm font-semibold">{{ t('passkeys.title') }}</h3>
          <PasskeyManager />
        </div>
        <div class="min-w-0 space-y-3 border-t border-[var(--color-line)] pt-4 md:border-s md:border-t-0 md:ps-4 md:pt-0">
          <h3 class="text-sm font-semibold">{{ t('account.changePassword') }}</h3>
          <ChangePasswordForm />
        </div>
      </div>
    </section>
    <NotificationPreferencesPanel v-else-if="user && !user.inSystem" />
    <ConfirmActionModal
      v-model:open="currencyDialogOpen"
      :title="t('profileCurrency.title', { currency: nextCurrency ? t(`profileCurrency.${nextCurrency}`) : '' })"
      :description="currencyWarning"
      :confirm-label="t('profileCurrency.confirm')"
      :loading="currencyPending"
      :error="currencyError"
      @confirm="saveCurrency"
    />
    <ChangeEmailDialog v-model:open="emailOpen" :account-id="identity" @changed="updateEmail" />
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('profileDetails.deletePhoto')" :description="t('common.irreversible')" :loading="photoPending" :error="error" @confirm="changePhoto(null)" />
  </section>
</template>
