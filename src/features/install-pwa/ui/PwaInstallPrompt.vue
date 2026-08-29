<script setup lang="ts">
import { getPwaInstallDismissedKey, getPwaInstallVariant, isStandalonePwa } from '../model/install-pwa'

const pwa = usePWA()
const browser = ref({ userAgent: '', platform: '', maxTouchPoints: 0 })
const standalone = ref(false)
const dismissed = ref(false)
const iosInstructionsOpen = ref(false)

onMounted(() => {
  browser.value = { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }
  standalone.value = isStandalonePwa({
    displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  })
  dismissed.value = localStorage.getItem(getPwaInstallDismissedKey(browser.value)) === 'true'
})

const variant = computed(() => getPwaInstallVariant({
  ...browser.value,
  isInstalled: standalone.value || Boolean(pwa?.isPWAInstalled),
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
    <header class="pwa-install-card__header">
      <p class="pwa-install-card__title">Aparts</p>
      <div class="pwa-install-card__header-actions">
        <UButton class="pwa-install-card__dismiss" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('pwa.dismiss')" @click="dismiss" />
        <div class="pwa-install-card__icon" aria-hidden="true">a<span>.</span></div>
      </div>
    </header>

    <div class="pwa-install-card__actions">
      <UButton v-if="variant === 'android'" color="primary" class="pwa-install-card__install" @click="install">
        {{ $t('pwa.installAsApp') }}
      </UButton>
      <p v-else class="pwa-install-card__install-label">{{ $t('pwa.installAsApp') }}</p>
      <UButton v-if="variant === 'ios'" color="neutral" variant="link" class="pwa-install-card__instruction" @click="install">
        {{ $t('pwa.instructions') }}
      </UButton>
    </div>

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
