<script setup lang="ts">
import { ResponsiveFormDialog } from '#fsd/shared/ui'
import { guestInputSchema, type GuestInput, type GuestSummary } from '@contracts/guests'

const props = defineProps<{ guest?: GuestInput & { id: string }; initialName?: string; conversationId?: string }>()
const emit = defineEmits<{ saved: [guest: GuestSummary] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
type ExtraContacts = Required<Pick<GuestInput, 'additionalPhones' | 'additionalEmails' | 'additionalWhatsapps'>>
const form = reactive<GuestInput & ExtraContacts>({
  name: '', phone: '', email: '', whatsapp: '', notes: '',
  additionalPhones: [], additionalEmails: [], additionalWhatsapps: [],
})
const contactFields = [
  { field: 'phone', extra: 'additionalPhones', label: 'guests.phone', type: 'tel', autocomplete: 'tel' },
  { field: 'email', extra: 'additionalEmails', label: 'guests.email', type: 'email', autocomplete: 'email' },
  { field: 'whatsapp', extra: 'additionalWhatsapps', label: 'WhatsApp', type: 'tel', autocomplete: 'off' },
] as const
const pending = ref(false)
const error = ref('')
watch(open, value => {
  if (!value) return
  const { name = props.initialName ?? '', phone = '', email = '', whatsapp = '', notes = '' } = props.guest ?? {}
  Object.assign(form, {
    name: name.slice(0, 160), phone, email, whatsapp, notes,
    additionalPhones: [...(props.guest?.additionalPhones ?? [])],
    additionalEmails: [...(props.guest?.additionalEmails ?? [])],
    additionalWhatsapps: [...(props.guest?.additionalWhatsapps ?? [])],
  })
  error.value = ''
})

async function save() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const guest = props.guest
      ? await $fetch<GuestSummary>(`/api/guests/${props.guest.id}`, { method: 'PATCH', body: form })
      : props.conversationId
        ? await $fetch<GuestSummary>(`/api/messaging/conversations/${props.conversationId}/guest`, { method: 'POST', body: { action: 'create', guest: form } })
        : await $fetch<GuestSummary>('/api/guests', { method: 'POST', body: form })
    open.value = false
    emit('saved', guest)
  } catch (cause: any) {
    error.value = cause?.data?.data?.code === 'GUEST_CONTACT_CONFLICT'
      ? t('guests.contactConflict')
      : cause?.data?.data?.code === 'GUEST_MESSAGING_CONFLICT'
        ? t('guests.messagingConflict') : t('common.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <ResponsiveFormDialog :modal="true" :overlay="true" v-model:open="open" :title="t(guest ? 'guests.edit' : 'guests.add')" :dismissible="!pending">
    <template #body>
      <UForm id="guest-form" :state="form" :schema="guestInputSchema" class="space-y-4" @submit="save">
        <UFormField name="name" :label="t('guests.name')"><UInput v-model="form.name" autocomplete="name" class="w-full" :ui="{ base: 'min-h-11' }" /></UFormField>
        <div v-for="contact in contactFields" :key="contact.field" class="space-y-2">
          <UFormField :name="contact.field" :label="contact.label === 'WhatsApp' ? contact.label : t(contact.label)">
            <UInput v-model="form[contact.field]" :type="contact.type" :autocomplete="contact.autocomplete" class="w-full" :ui="{ base: 'min-h-11' }" />
          </UFormField>
          <div v-for="(_, index) in form[contact.extra]" :key="index" class="flex items-start gap-2">
            <UFormField :name="`${contact.extra}.${index}`" class="min-w-0 flex-1">
              <UInput v-model="form[contact.extra][index]" :type="contact.type" :aria-label="contact.label === 'WhatsApp' ? contact.label : t(contact.label)" class="w-full" :ui="{ base: 'min-h-11' }" />
            </UFormField>
            <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-x" class="size-11 justify-center" :aria-label="t('guests.removeContact')" @click="form[contact.extra].splice(index, 1)" />
          </div>
          <UButton v-if="form[contact.extra].length < 30" type="button" color="neutral" variant="ghost" icon="i-lucide-plus" class="min-h-11" @click="form[contact.extra].push('')">{{ t('guests.addContact') }}</UButton>
        </div>
        <slot />
        <UFormField name="notes" :label="t('guests.notes')"><UTextarea v-model="form.notes" class="w-full" :ui="{ base: 'min-h-11' }" /></UFormField>
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
      </UForm>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <UButton class="min-h-11" color="neutral" variant="ghost" :disabled="pending" @click="open = false">{{ t('calendar.cancel') }}</UButton>
        <UButton class="min-h-11" type="submit" form="guest-form" :loading="pending">{{ t('calendar.saveChanges') }}</UButton>
      </div>
    </template>
  </ResponsiveFormDialog>
</template>
