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
  <section v-if="visible" class="pwa-install-card" aria-label="Установка приложения Aparts">
    <div class="pwa-install-card__icon" aria-hidden="true">a<span>.</span></div>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">{{ variant === 'ios' ? 'Открыть Aparts без панелей Safari' : 'Установить Aparts' }}</p>
      <p class="pwa-install-card__description">{{ variant === 'ios' ? 'Установите CRM с crm.aparts-bansko.com как веб-приложение.' : 'Быстрый доступ к CRM с домашнего экрана.' }}</p>
    </div>
    <UButton color="primary" size="sm" class="shrink-0" @click="install">{{ variant === 'ios' ? 'Инструкция' : 'Установить' }}</UButton>
    <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Закрыть предложение установить Aparts" @click="dismiss" />
    <div v-if="iosInstructionsOpen" class="pwa-install-card__instructions">
      <p class="font-semibold">Установите CRM как веб-приложение</p>
      <ol>
        <li>Откройте <strong>crm.aparts-bansko.com</strong> напрямую в Safari.</li>
        <li>Нажмите «Поделиться» <UIcon name="i-lucide-share" class="inline size-4 align-[-.15em]" />.</li>
        <li>Выберите «На экран «Домой»».</li>
        <li>Включите «Открывать как веб-приложение / Open as Web App», если переключатель отображается.</li>
        <li>Нажмите «Добавить».</li>
      </ol>
      <div class="pwa-install-card__repair">
        <p class="font-semibold">Если панели Safari уже появляются</p>
        <p>Удалите старую иконку Aparts с экрана «Домой», затем повторите установку по шагам выше.</p>
      </div>
      <UButton color="neutral" variant="ghost" size="sm" @click="iosInstructionsOpen = false">Понятно</UButton>
    </div>
  </section>
</template>
