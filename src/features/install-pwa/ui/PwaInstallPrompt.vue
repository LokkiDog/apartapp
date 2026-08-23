<script setup lang="ts">
import { getPwaInstallVariant } from '../model/install-pwa'

const DISMISSED_KEY = 'aparts-pwa-install-card-dismissed'
const pwa = usePWA()
const browser = ref({ userAgent: '', platform: '', maxTouchPoints: 0 })
const dismissed = ref(false)
const iosInstructionsOpen = ref(false)

onMounted(() => {
  browser.value = { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }
  dismissed.value = localStorage.getItem(DISMISSED_KEY) === 'true'
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
  localStorage.setItem(DISMISSED_KEY, 'true')
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
  <section v-if="visible" class="pwa-install-card" aria-label="Установка приложения Aparts">
    <div class="pwa-install-card__icon" aria-hidden="true">a<span>.</span></div>
    <div class="min-w-0 flex-1"><p class="font-semibold">Установить Aparts</p><p class="pwa-install-card__description">Быстрый доступ к CRM с домашнего экрана.</p></div>
    <UButton color="primary" size="sm" class="shrink-0" @click="install">Установить</UButton>
    <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Закрыть предложение установить Aparts" @click="dismiss" />
    <div v-if="iosInstructionsOpen" class="pwa-install-card__instructions">
      <p class="font-semibold">Добавьте на экран «Домой»</p>
      <ol><li>Нажмите «Поделиться» <UIcon name="i-lucide-share" class="inline size-4 align-[-.15em]" /> в Safari.</li><li>Выберите «На экран «Домой»».</li><li>Подтвердите добавление Aparts.</li></ol>
      <UButton color="neutral" variant="ghost" size="sm" @click="iosInstructionsOpen = false">Понятно</UButton>
    </div>
  </section>
</template>
