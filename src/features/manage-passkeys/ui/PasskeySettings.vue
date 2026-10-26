<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { usePasskeys } from '#fsd/shared/lib'
import PasskeyManager from './PasskeyManager.vue'

withDefaults(defineProps<{ showTrigger?: boolean }>(), { showTrigger: true })
const { t } = useI18n()
const toast = useToast()
const user = useCurrentUser()
const passkeys = usePasskeys()
const open = ref(false)
const busy = ref(false)
const offerPending = ref(false)
const offerError = ref('')
const offerOpen = computed({
  get: () => Boolean(passkeys.supported.value && passkeys.offer.value?.userId === user.value?.id && passkeys.offer.value && !open.value),
  set: value => { if (!value && !offerPending.value) passkeys.postponeOffer() }
})
async function acceptOffer() {
  if (offerPending.value) return
  offerPending.value = true; offerError.value = ''
  try {
    if (await passkeys.acceptOffer(t('passkeys.defaultName'))) {
      await refreshNuxtData('account-passkeys')
      toast.add({ title: t('passkeys.added'), color: 'success' })
    } else {
      open.value = true
    }
  } catch (cause: any) {
    if (cause?.name === 'NotAllowedError' || cause?.name === 'AbortError') {
      offerError.value = t('passkeys.cancelled')
    } else {
      passkeys.offer.value = null
      open.value = true
      await nextTick()
      toast.add({ title: t('passkeys.addError'), color: 'error' })
    }
  } finally { offerPending.value = false }
}
</script>

<template>
  <UButton v-if="showTrigger" color="neutral" variant="ghost" icon="i-lucide-fingerprint" class="min-h-11 min-w-11 cursor-pointer" :aria-label="t('passkeys.title')" @click="open = true" />
  <UModal v-model:open="offerOpen" :title="t('passkeys.offerTitle')" :dismissible="!offerPending">
    <template #body>
      <p class="text-sm leading-6 text-[var(--color-muted)]">{{ t('passkeys.offerDescription') }}</p>
      <UAlert v-if="offerError" color="error" variant="soft" :description="offerError" class="mt-4" />
    </template>
    <template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" :disabled="offerPending" @click="passkeys.postponeOffer()">{{ t('passkeys.later') }}</UButton><UButton icon="i-lucide-fingerprint" :loading="offerPending" :disabled="offerPending" @click="acceptOffer">{{ t('passkeys.create') }}</UButton></div></template>
  </UModal>
  <USlideover v-model:open="open" :title="t('passkeys.title')" :modal="true" :overlay="true" :dismissible="!busy">
    <template #body><PasskeyManager v-if="open" @busy="busy = $event" /></template>
  </USlideover>
</template>
