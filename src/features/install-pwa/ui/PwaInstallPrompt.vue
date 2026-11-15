<script setup lang="ts">
import { getPwaInstallDismissedKey, getPwaInstallVariant, isStandalonePwa } from '../model/install-pwa'

const { public: { brand } } = useRuntimeConfig()
const pwa = usePWA()
const browser = ref<Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> | null>(null)
const standalone = ref(false)
const dismissed = ref(false)
const iosInstructionsOpen = ref(false)

onMounted(() => {
  const device = { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }
  standalone.value = isStandalonePwa({
    displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  })
  dismissed.value = localStorage.getItem(getPwaInstallDismissedKey(device)) === 'true'
  browser.value = device
})

const variant = computed(() => browser.value ? getPwaInstallVariant({
  ...browser.value,
  isInstalled: standalone.value || Boolean(pwa?.isPWAInstalled),
  hasNativePrompt: Boolean(pwa?.showInstallPrompt),
  dismissed: dismissed.value
}) : null)

function dismiss() {
  if (!browser.value) return
  if (variant.value === 'android') pwa?.cancelInstall()
  dismissed.value = true
  localStorage.setItem(getPwaInstallDismissedKey(browser.value), 'true')
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
  <section v-if="variant" class="pwa-install-card" :aria-label="$t('pwa.ariaLabel', { brand: brand.shortName })">
    <header class="pwa-install-card__header">
      <img v-if="brand.logo" :src="brand.icon192" alt="" class="size-11 rounded-lg" width="44" height="44" />
      <div v-else class="pwa-install-card__icon" aria-hidden="true">
        <UIcon name="i-lucide-smartphone" class="size-5" />
      </div>
      <div class="min-w-0">
        <p class="pwa-install-card__title">{{ $t('pwa.installTitle', { brand: brand.shortName }) }}</p>
        <p class="pwa-install-card__description">{{ $t('pwa.installDescription') }}</p>
      </div>
      <UButton class="pwa-install-card__dismiss" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('pwa.dismiss', { brand: brand.shortName })" @click="dismiss" />
    </header>

    <UButton
      v-if="variant === 'android' || !iosInstructionsOpen"
      color="neutral"
      variant="solid"
      class="pwa-install-card__install"
      @click="install"
    >
      {{ $t(variant === 'ios' ? 'pwa.instructions' : 'pwa.install') }}
    </UButton>

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
        <p>{{ $t('pwa.repairText', { brand: brand.shortName }) }}</p>
      </div>
      <UButton color="neutral" variant="ghost" class="pwa-install-card__dismiss" @click="iosInstructionsOpen = false">{{ $t('common.close') }}</UButton>
    </div>
  </section>
</template>
