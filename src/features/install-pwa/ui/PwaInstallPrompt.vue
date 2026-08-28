<script setup lang="ts">
import { getPwaInstallDismissedKey, getPwaInstallVariant } from '../model/install-pwa'

const pwa = usePWA()
const browser = ref({ userAgent: '', platform: '', maxTouchPoints: 0 })
const dismissed = ref(false)
const iosInstructionsOpen = ref(false)

onMounted(() => {
  browser.value = { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }
  dismissed.value = localStorage.getItem(getPwaInstallDismissedKey(browser.value)) === 'true'
})

const variant = computed(() => getPwaInstallVariant({
  ...browser.value,
  isInstalled: Boolean(pwa?.isPWAInstalled),
  hasNativePrompt: Boolean(pwa?.showInstallPrompt),
  dismissed: dismissed.value
}))
const visible = computed(() => variant.value !== null)

function dismiss() {
  dismissed.value = true
  localStorage.setItem(getPwaInstallDismissedKey(browser.value), 'true')
  if (variant.value === 'android') pwa?.cancelInstall()
}

async function install() {
  if (variant.value === 'ios') {
    iosInstructionsOpen.value = true
    return
  }
  const result = await pwa?.install()
  if (result?.outcome === 'accepted') dismissed.value = true
}
</script>

<template>
  <section v-if="visible" class="pwa-install-card" :aria-label="$t('pwa.ariaLabel')">
    <div class="pwa-install-card__icon" aria-hidden="true">a<span>.</span></div>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">{{ variant === 'ios' ? $t('pwa.iosTitle') : $t('pwa.installTitle') }}</p>
      <p class="pwa-install-card__description">{{ variant === 'ios' ? $t('pwa.iosDescription') : $t('pwa.installDescription') }}</p>
    </div>
    <UButton color="primary" size="sm" class="shrink-0" @click="install">{{ variant === 'ios' ? $t('pwa.instructions') : $t('pwa.install') }}</UButton>
    <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('pwa.dismiss')" @click="dismiss" />
    <div v-if="iosInstructionsOpen" class="pwa-install-card__instructions">
      <p class="font-semibold">{{ $t('pwa.iosStepsTitle') }}</p>
      <ol>
        <li>{{ $t('pwa.step1') }}</li>
        <li>{{ $t('pwa.step2') }} <UIcon name="i-lucide-share" class="inline size-4 align-[-.15em]" />.</li>
        <li>{{ $t('pwa.step3') }}</li>
        <li>{{ $t('pwa.step4') }}</li>
        <li>{{ $t('pwa.step5') }}</li>
      </ol>
      <div class="pwa-install-card__repair">
        <p class="font-semibold">{{ $t('pwa.repairTitle') }}</p>
        <p>{{ $t('pwa.repairText') }}</p>
      </div>
      <UButton color="neutral" variant="ghost" size="sm" @click="iosInstructionsOpen = false">{{ $t('common.close') }}</UButton>
    </div>
  </section>
</template>
