<script setup lang="ts">
import { guestInputSchema, type GuestInput, type GuestSummary } from '@contracts/guests'

const props = defineProps<{ guest?: GuestInput & { id: string }; initialName?: string; conversationId?: string }>()
const emit = defineEmits<{ saved: [guest: GuestSummary] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const form = reactive<GuestInput>({ name: '', phone: '', email: '', whatsapp: '', notes: '' })
const pending = ref(false)
const error = ref('')
watch(open, value => {
  if (!value) return
  const { name = props.initialName ?? '', phone = '', email = '', whatsapp = '', notes = '' } = props.guest ?? {}
  Object.assign(form, { name: name.slice(0, 160), phone, email, whatsapp, notes })
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
  <USlideover :modal="true" :overlay="true" v-model:open="open" :title="t(guest ? 'guests.edit' : 'guests.add')" :dismissible="!pending">
    <template #body>
      <UForm id="guest-form" :state="form" :schema="guestInputSchema" class="space-y-4" @submit="save">
        <UFormField name="name" :label="t('guests.name')"><UInput v-model="form.name" autocomplete="name" class="w-full" :ui="{ base: 'min-h-11' }" /></UFormField>
        <UFormField name="phone" :label="t('common.phone')"><UInput v-model="form.phone" type="tel" autocomplete="tel" class="w-full" :ui="{ base: 'min-h-11' }" /></UFormField>
        <UFormField name="email" label="Email"><UInput v-model="form.email" type="email" autocomplete="email" class="w-full" :ui="{ base: 'min-h-11' }" /></UFormField>
        <UFormField name="whatsapp" label="WhatsApp"><UInput v-model="form.whatsapp" type="tel" placeholder="+359..." class="w-full" :ui="{ base: 'min-h-11' }" /></UFormField>
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
  </USlideover>
</template>
