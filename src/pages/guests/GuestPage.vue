<script setup lang="ts">
import { guestNotesSchema, normalizeGuestPhone, type GuestConversation, type GuestDetail, type GuestStay } from '@contracts/guests'
import { useCurrentUser, useCurrentUserScope } from '#fsd/shared/auth'
import { PageHeader, ResponsiveFormDialog, StatusBadge } from '#fsd/shared/ui'
import { GuestForm } from '#fsd/features/guest-form'
import GuestLinkPicker from './GuestLinkPicker.vue'

const { t, locale } = useI18n()
const route = useRoute()
const user = useCurrentUser()
const userScope = useCurrentUserScope()
const id = computed(() => String(route.params.id))
const allowed = computed(() => user.value?.guestsEnabled && user.value.roles.includes('administrator') && !user.value.inSystem)
const messagingEnabled = computed(() => allowed.value && user.value?.messagingEnabled)
const formOpen = ref(false)
const pickerOpen = ref(false)
const channels = [
  { id: 'telegram', label: 'Telegram', icon: 'i-lucide-send' },
  { id: 'line', label: 'LINE', icon: 'i-lucide-message-circle' },
] as const
const selectedChannel = ref<GuestConversation['channel']>()
const pickerTitle = computed(() => t('guests.linkChannel', {
  channel: channels.find(channel => channel.id === selectedChannel.value)?.label,
}))

function openChannelPicker(channel: GuestConversation['channel']) {
  selectedChannel.value = channel
  pickerOpen.value = true
}
const pending = ref(false)
const error = ref('')
const { data: guest, status, refresh } = await useAsyncData(
  computed(() => `guest-${userScope.value}-${id.value}`),
  () => allowed.value ? $fetch<GuestDetail>(`/api/guests/${encodeURIComponent(id.value)}`) : Promise.resolve(null),
  { server: false, default: () => null, watch: [userScope] },
)
type ContactEntry = { value: string; to?: string; external?: boolean; newTab?: boolean }

const contactColumns = computed(() => {
  const profile = guest.value
  if (!profile) return []
  const entries = (values: string[], link: (value: string) => string | undefined, newTab = false): ContactEntry[] =>
    [...new Set(values.filter(Boolean))].map(value => ({ value, to: link(value), external: true, newTab }))
  const messengers = channels.map(channel => ({
    label: channel.label,
    icon: channel.icon,
    contacts: (messagingEnabled.value ? profile.conversations : [])
      .filter(chat => chat.channel === channel.id)
      .map(chat => ({ value: chat.username ? `@${chat.username}` : chat.name, to: `/messages/${chat.id}` } as ContactEntry)),
  }))
  return [
    [...messengers, {
      label: 'WhatsApp',
      icon: 'i-lucide-message-circle',
      contacts: entries([profile.whatsapp, ...(profile.additionalWhatsapps ?? [])], value => `https://wa.me/${value.slice(1)}`, true),
    }],
    [{
      label: t('guests.phone'),
      icon: 'i-lucide-phone',
      contacts: entries([profile.phone, ...(profile.additionalPhones ?? [])], value => {
        const phone = normalizeGuestPhone(value)
        return phone ? `tel:${phone}` : undefined
      }),
    }, {
      label: t('guests.email'),
      icon: 'i-lucide-mail',
      contacts: entries([profile.email, ...(profile.additionalEmails ?? [])], value => `mailto:${encodeURIComponent(value)}`),
    }],
  ].map(column => column.filter(group => group.contacts.length)).filter(column => column.length)
})

const notesOpen = ref(false)
const notesForm = reactive({ notes: '' })
const notesPending = ref(false)
const notesError = ref('')

function editNotes() {
  notesForm.notes = guest.value?.notes ?? ''
  notesError.value = ''
  notesOpen.value = true
}

async function saveNotes() {
  if (notesPending.value || !guest.value) return
  const guestId = guest.value.id
  const scope = userScope.value
  notesPending.value = true
  notesError.value = ''
  try {
    const { notes } = await $fetch<{ notes: string }>(`/api/guests/${guestId}/notes`, { method: 'PATCH', body: notesForm })
    if (id.value === guestId && userScope.value === scope && guest.value?.id === guestId) {
      guest.value = { ...guest.value, notes }
      notesOpen.value = false
    }
  } catch {
    if (id.value === guestId && userScope.value === scope) notesError.value = t('common.error')
  } finally {
    notesPending.value = false
  }
}
const guestName = computed(() => guest.value?.name || t('guests.unnamed'))
const guestInitial = computed(() => Array.from(guest.value?.name.trim() ?? '')[0]?.toLocaleUpperCase(locale.value))
const guestActions = computed(() => {
  const currentGuest = guest.value
  if (!currentGuest) return []
  const actions = [
    { label: t('guests.editCard'), icon: 'i-lucide-pencil', onSelect: () => { formOpen.value = true } },
    ...(messagingEnabled.value ? channels.map(channel => ({
      label: t('guests.linkChannel', { channel: channel.label }),
      icon: channel.icon,
      onSelect: () => openChannelPicker(channel.id),
    })) : []),
  ]
  const unlinkActions = messagingEnabled.value ? currentGuest.conversations.map(chat => ({
    label: `${chat.channel === 'line' ? 'LINE' : 'Telegram'} · ${chat.username ? `@${chat.username}` : chat.name}`,
    onSelect: () => unlinkContact(chat.contactId),
  })) : []
  return unlinkActions.length
    ? [...actions, { label: t('guests.unlink'), icon: 'i-lucide-unlink', disabled: pending.value, children: unlinkActions }]
    : actions
})
const todayFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Sofia',
})
const stayDateFormatter = computed(() => new Intl.DateTimeFormat(
  locale.value,
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
))
const staySections = computed(() => {
  const today = todayFormatter.format(new Date())
  const stays = guest.value?.stays ?? []
  const upcoming = stays
    .filter(stay => stay.state === 'active' && stay.checkInOn >= today)
    .sort((left, right) => left.checkInOn.localeCompare(right.checkInOn))
  const [next] = upcoming
  return {
    next,
    current: stays.filter(stay => stay.state === 'active' && stay.checkInOn < today && stay.checkOutOn >= today),
    upcoming: upcoming.slice(1),
    past: stays.filter(stay => stay.checkOutOn < today),
    inactive: stays.filter(stay => stay.state !== 'active' && stay.checkOutOn >= today),
  }
})
const stayGroups = computed(() => [
  { key: 'past', stays: staySections.value.past },
  { key: 'current', stays: staySections.value.current },
  { key: 'upcoming', stays: staySections.value.upcoming },
  { key: 'inactive', stays: staySections.value.inactive },
].filter(group => group.stays.length))

function stayDates(stay: GuestStay) {
  return stayDateFormatter.value.formatRange(new Date(stay.checkInOn), new Date(stay.checkOutOn)).replace(/\s*г\.$/u, '')
}

function stayNights(stay: GuestStay) {
  const count = (Date.parse(stay.checkOutOn) - Date.parse(stay.checkInOn)) / 86_400_000
  return t(`guests.nights.${new Intl.PluralRules(locale.value).select(count)}`, { count })
}

function stayStatus(stay: GuestStay) {
  if (stay.state === 'canceled') return t('guests.stayCanceled')
  if (stay.state === 'superseded') return t('guests.staySuperseded')
  if (stay.state === 'hidden') return t('guests.stayHidden')
  return ''
}

watch([id, userScope], () => {
  formOpen.value = false
  notesOpen.value = false
  pickerOpen.value = false
  error.value = ''
})
watch(messagingEnabled, enabled => { if (!enabled) pickerOpen.value = false })

async function unlinkContact(linkedId: string) {
  if (pending.value || !guest.value) return
  const guestId = guest.value.id
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/guests/${guestId}/contact`, { method: 'PATCH', body: { id: linkedId, linked: false } })
    if (id.value === guestId) await refresh()
  } catch {
    if (id.value === guestId) error.value = t('common.error')
  } finally {
    pending.value = false
  }
}

async function onLinked() {
  pickerOpen.value = false
  await refresh()
}
</script>

<template>
  <section v-if="allowed" class="page-wrap guest-page">
    <p v-if="status === 'pending' || status === 'idle'" role="status">{{ t('guests.loading') }}</p>
    <UAlert v-else-if="status === 'error' || !guest" color="error" variant="soft" :description="t('guests.loadError')" :actions="[{ label: t('guests.retry'), onClick: () => refresh() }]" />
    <template v-else>
      <div class="guest-heading">
        <UAvatar v-if="guestInitial" :text="guestInitial" class="guest-avatar" :ui="{ fallback: 'text-white text-[22px] font-semibold' }" aria-hidden="true" />
        <UAvatar v-else icon="i-lucide-user" class="guest-avatar" :ui="{ icon: 'text-white' }" aria-hidden="true" />
        <PageHeader class="guest-page-header min-w-0 flex-1" :title="guestName">
          <template #actions>
            <UDropdownMenu :items="guestActions" :content="{ align: 'end' }">
              <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis" class="size-11 justify-center" :aria-label="t('guests.actions')" />
            </UDropdownMenu>
          </template>
        </PageHeader>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />
      <div class="guest-grid">
        <section class="surface guest-profile min-w-0" aria-labelledby="guest-contact-title">
          <h2 id="guest-contact-title" class="guest-contact-title">{{ t('guests.contacts') }}</h2>
          <div v-if="contactColumns.length" class="guest-contact-columns" :class="{ 'guest-contact-single': contactColumns.length === 1 }">
            <dl v-for="(column, index) in contactColumns" :key="index">
              <div v-for="group in column" :key="group.label" class="guest-contact-group">
                <dt><UIcon :name="group.icon" class="guest-channel-icon" aria-hidden="true" />{{ group.label }}</dt>
                <dd>
                  <ul>
                    <li v-for="(contact, entryIndex) in group.contacts" :key="entryIndex">
                      <NuxtLink
                        v-if="contact.to"
                        :to="contact.to"
                        :external="contact.external"
                        :target="contact.newTab ? '_blank' : undefined"
                        :rel="contact.newTab ? 'noopener noreferrer' : undefined"
                        class="guest-contact-value guest-record-link"
                      ><bdi>{{ contact.value }}</bdi></NuxtLink>
                      <bdi v-else class="guest-contact-value">{{ contact.value }}</bdi>
                    </li>
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
          <p v-else class="my-2 text-[var(--color-muted)]">{{ t('guests.noContacts') }}</p>
          <section class="guest-note" aria-labelledby="guest-comment-title">
            <div class="min-w-0 flex-1">
              <h3 id="guest-comment-title">{{ t('guests.comment') }}</h3>
              <p v-if="guest.notes" class="whitespace-pre-wrap break-words">{{ guest.notes }}</p>
              <p v-else class="text-[var(--color-muted)]">{{ t('guests.noComment') }}</p>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" class="guest-note-edit size-11 shrink-0 justify-center" :aria-label="t('guests.editComment')" @click="editNotes" />
          </section>
        </section>

        <section class="grid min-w-0 gap-2" :aria-label="t('guests.stays')">
          <section v-if="staySections.next" class="surface guest-upcoming p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="guest-section-title">{{ t('guests.nextStay') }}</h2>
              <StatusBadge :label="t('guests.stayBooked')" tone="success" />
            </div>
            <NuxtLink :to="{ path: '/calendar', query: { stay: staySections.next.id } }" class="guest-record-link guest-next-link">
              <span class="guest-stay-dates">{{ stayDates(staySections.next) }}</span>
              <span class="guest-stay-unit">
                {{ staySections.next.apartmentName }} <span class="text-[var(--color-muted)]">· {{ stayNights(staySections.next) }}</span>
              </span>
            </NuxtLink>
          </section>

          <component :is="group.key === 'past' ? 'details' : 'section'" v-for="group in stayGroups" :key="`${guest.id}:${group.key}`" class="surface guest-stay-group" :class="{ 'guest-history': group.key === 'past' }">
            <summary v-if="group.key === 'past'" class="guest-history-summary guest-section-title">
              <span>{{ t('guests.stayGroups.past') }} <span class="ms-1 text-sm font-semibold text-[var(--color-muted)]">{{ group.stays.length }}</span></span>
              <UIcon name="i-lucide-chevron-down" class="guest-history-chevron size-4 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
            </summary>
            <h2 v-else class="guest-section-title pt-3 pb-2">{{ t(`guests.stayGroups.${group.key}`) }}</h2>
            <ul class="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              <li v-for="stay in group.stays" :key="stay.id" class="flex items-center gap-1">
                <NuxtLink :to="{ path: '/calendar', query: { stay: stay.id } }" class="guest-record-link guest-row flex-1">
                  <span class="guest-row-title">{{ stay.apartmentName }}</span>
                  <span class="guest-row-subtitle">{{ stayDates(stay) }}<template v-if="stayStatus(stay)"> · {{ stayStatus(stay) }}</template></span>
                </NuxtLink>
              </li>
            </ul>
          </component>

          <div v-if="!guest.stays.length" class="surface guest-empty-stays">
            <h2 class="guest-contact-title">{{ t('guests.stays') }}</h2>
            <p class="text-[var(--color-muted)]">{{ t('guests.noStays') }}</p>
          </div>
        </section>
      </div>

      <UModal v-model:open="notesOpen" :title="t('guests.comment')" :dismissible="!notesPending" :close="!notesPending" :ui="{ content: 'max-w-sm' }">
        <template #body>
          <UForm id="guest-notes-form" :schema="guestNotesSchema" :state="notesForm" class="space-y-2" @submit="saveNotes">
            <UFormField name="notes">
              <UTextarea v-model="notesForm.notes" :aria-label="t('guests.comment')" :rows="3" :maxlength="2000" autofocus class="w-full" :disabled="notesPending" />
            </UFormField>
            <UAlert v-if="notesError" color="error" variant="soft" :description="notesError" />
          </UForm>
        </template>
        <template #footer>
          <div class="form-actions form-actions--footer">
            <UButton type="button" color="neutral" variant="ghost" class="min-h-11" :disabled="notesPending" @click="notesOpen = false">{{ t('calendar.cancel') }}</UButton>
            <UButton type="submit" form="guest-notes-form" class="min-h-11" :loading="notesPending">{{ t('calendar.saveChanges') }}</UButton>
          </div>
        </template>
      </UModal>
      <GuestForm v-model:open="formOpen" :guest="guest" @saved="refresh()" />
      <ResponsiveFormDialog :modal="true" :overlay="true" v-model:open="pickerOpen" :title="pickerTitle">
        <template #body>
          <GuestLinkPicker
            v-if="selectedChannel" :key="selectedChannel" :guest-id="guest.id"
            :channel="selectedChannel"
            :linked-ids="guest.conversations.map(item => item.contactId)"
            @saved="onLinked"
          />
        </template>
      </ResponsiveFormDialog>
    </template>
  </section>
</template>

<style scoped>
.guest-page {
  container: guest-card / inline-size;
  width: min(100%, 1024px);
  padding: clamp(14px, 3vw, 32px);
  color: var(--color-ink);
  font-size: 14px;
  line-height: 1.45;
}

.guest-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.guest-avatar {
  width: 44px;
  height: 44px;
  flex: none;
  background: var(--color-primary);
}

.guest-page-header {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.guest-page-header :deep(.page-header__actions) {
  width: auto;
}

.guest-page-header :deep(.page-title) {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: clamp(20px, 4vw, 29px);
  font-weight: 650;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.guest-grid {
  display: grid;
  gap: 8px;
}

.guest-section-title {
  font-size: 16px;
  font-weight: 620;
  line-height: 1.25;
}

.guest-stay-group {
  box-shadow: 0 1px 2px color-mix(in srgb, var(--color-ink) 7%, transparent);
}

.guest-upcoming {
  background: var(--color-primary-soft);
  box-shadow: none;
}

.guest-upcoming :deep(.status-badge) {
  min-height: 20px;
  border-radius: 0;
  background: color-mix(in srgb, var(--color-surface) 72%, var(--color-primary-soft));
  padding: 0 8px;
  font-weight: 550;
}

.guest-next-link {
  margin-top: 17px;
}

.guest-stay-dates {
  display: block;
  font-size: clamp(21px, 3.8vw, 31px);
  font-weight: 650;
  line-height: 1.16;
  letter-spacing: -0.035em;
  font-variant-numeric: tabular-nums;
}

.guest-stay-unit {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.guest-stay-unit span {
  white-space: nowrap;
}

.guest-stay-group {
  padding-inline: 16px;
}

.guest-history {
  padding-block: 5px;
}

.guest-history-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  gap: 8px;
  border-radius: 8px;
  list-style: none;
  cursor: pointer;
}

.guest-history-summary::-webkit-details-marker {
  display: none;
}

.guest-stay-group[open] .guest-history-chevron {
  rotate: 180deg;
}

.guest-profile {
  padding: 14px 16px 10px;
  background: var(--color-primary-soft);
  box-shadow: none;
}

.guest-contact-title {
  font-size: 15px;
  font-weight: 630;
  line-height: 1.3;
}

.guest-contact-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 4px;
}

.guest-contact-single {
  grid-template-columns: minmax(0, 1fr);
}

.guest-contact-group {
  display: grid;
  grid-template-columns: 95px minmax(0, 1fr);
  gap: 12px;
  padding-block: 8px;
}

.guest-contact-group + .guest-contact-group,
.guest-note {
  border-top: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
}

.guest-contact-group dt {
  display: flex;
  align-items: center;
  align-self: start;
  gap: 6px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 24px;
}

.guest-contact-group dt .guest-channel-icon {
  width: 15px;
  height: 15px;
  flex: none;
}

.guest-contact-value {
  display: block;
  min-height: 24px;
  border-radius: 6px;
  font-weight: 550;
  line-height: 24px;
  overflow-wrap: anywhere;
}

a.guest-contact-value:hover,
a.guest-contact-value:active {
  color: var(--color-primary-strong);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.guest-note {
  display: flex;
  align-items: start;
  gap: 8px;
  padding-top: 8px;
}

.guest-note h3 {
  margin-bottom: 3px;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 630;
}

.guest-note-edit:hover {
  background: var(--color-surface);
}

.guest-note-edit:active {
  background: var(--color-line);
}

.guest-empty-stays {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding: 11px 16px;
}

@container guest-card (max-width: 575px) {
  .guest-contact-columns {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .guest-contact-columns dl + dl {
    border-top: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
  }
}

@container guest-card (max-width: 320px) {
  .guest-profile {
    padding-inline: 12px;
  }

  .guest-contact-group {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 8px;
  }

  .guest-contact-group dt .guest-channel-icon {
    display: none;
  }
}

@media (pointer: coarse) {
  a.guest-contact-value {
    display: flex;
    min-height: 44px;
    align-items: center;
  }
}

.guest-row {
  display: flex;
  min-width: 0;
  min-height: 50px;
  flex-direction: column;
  justify-content: center;
  overflow-wrap: anywhere;
}

.guest-row-title {
  font-size: 13px;
  font-weight: 570;
}

.guest-row-subtitle {
  color: var(--color-muted);
  font-size: 12px;
}

.guest-record-link {
  cursor: pointer;
}

.guest-next-link {
  display: block;
  border-radius: 8px;
  min-height: 44px;
}

.guest-record-link:hover,
.guest-history-summary:hover {
  background: var(--color-surface-muted);
}

.guest-record-link:active,
.guest-history-summary:active {
  background: var(--color-primary-soft);
}

.guest-upcoming .guest-record-link:hover,
.guest-upcoming .guest-record-link:active {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.guest-record-link:focus-visible,
.guest-history-summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}



@media (max-width: 360px) {
  .guest-heading,
  .guest-page-header {
    gap: 8px;
  }

  .guest-avatar {
    width: 44px;
    height: 44px;
  }
}
</style>
