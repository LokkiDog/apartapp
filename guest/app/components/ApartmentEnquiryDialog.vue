<script setup lang="ts">
import { validStayDates } from '#shared/site'
const { copy, contact } = useSite()
const { target, open } = useApartmentEnquiry()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const start = ref('')
const end = ref('')
const attempted = ref(false)
const valid = computed(() => validStayDates({ start: start.value, end: end.value }))
const link = computed(() => target.value ? contact(target.value.title, target.value.slug, { start: start.value, end: end.value }) : undefined)
let trigger: HTMLElement | null = null
watch(() => target.value?.slug, () => { start.value = ''; end.value = ''; attempted.value = false })
watch(open, async value => {
  if (!value) { dialog.value?.close(); return }
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  attempted.value = false
  await nextTick()
  if (open.value && !dialog.value?.open) dialog.value?.showModal()
})
function close() { open.value = false; dialog.value?.close() }
function closed() {
  open.value = false
  if (trigger?.isConnected) trigger.focus({ preventScroll: true })
}
function clearDates() { start.value = ''; end.value = ''; attempted.value = false }
function proceed(event: MouseEvent) {
  if (!valid.value || !link.value) {
    event.preventDefault(); attempted.value = true
    dialog.value?.querySelector<HTMLInputElement>('input')?.focus()
    return
  }
  close()
}
onBeforeUnmount(() => { open.value = false; dialog.value?.close() })
</script>
<template>
  <dialog ref="dialog" class="apartment-enquiry-dialog" aria-labelledby="enquiry-title" aria-describedby="enquiry-hint" @close="closed" @click.self="close">
    <header class="enquiry-dialog-header"><h2 id="enquiry-title">{{ copy.enquiryTitle }}</h2><button type="button" class="enquiry-close" :aria-label="copy.close" autofocus @click="close">×</button></header>
    <div class="enquiry-dialog-body">
      <p class="enquiry-apartment">{{ target?.title }}</p>
      <fieldset class="enquiry-dates"><legend>{{ copy.stayDatesOptional }}</legend><p id="enquiry-hint">{{ copy.stayDatesHint }}</p><GuestDateRangeInput v-model:start="start" v-model:end="end" :invalid="attempted && !valid" :described-by="attempted && !valid ? 'enquiry-hint enquiry-dates-error' : 'enquiry-hint'" /><p v-if="attempted && !valid" id="enquiry-dates-error" class="enquiry-dates-error" role="alert">{{ copy.stayDatesError }}</p></fieldset>
      <button v-if="start || end" type="button" class="enquiry-clear" @click="clearDates">{{ copy.clearAllFilters }}</button>
    </div>
    <footer class="enquiry-dialog-footer"><a v-if="link" :href="link" class="button enquiry-whatsapp" target="_blank" rel="noopener noreferrer" @click="proceed">{{ copy.openWhatsApp }}</a><span v-else class="contact-pending">{{ copy.contactPending }}</span></footer>
  </dialog>
</template>
