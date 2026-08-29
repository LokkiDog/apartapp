<script setup lang="ts">
import type { AppLocale } from '@contracts/crm'
import { useCurrentUser } from '#fsd/shared/auth'
import { setFormatLocale } from '#fsd/shared/lib'

const props = withDefaults(defineProps<{ persist?: boolean }>(), { persist: true })
const { locale, setLocale, t } = useI18n()
const toast = useToast()
const user = useCurrentUser()
const choices: Array<{ code: AppLocale; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' }
]
const pending = ref(false)
if (import.meta.client) setFormatLocale(locale.value as AppLocale)

const items = computed(() => [choices.map(choice => ({
  label: choice.label,
  type: 'checkbox' as const,
  checked: locale.value === choice.code,
  onSelect: () => { void selectLocale(choice.code) }
}))])

async function selectLocale(next: AppLocale) {
  if (next === locale.value || pending.value) return
  const previous = locale.value as AppLocale
  pending.value = true
  await setLocale(next)
  if (import.meta.client) setFormatLocale(next)
  if (props.persist && user.value) {
    try {
      await $fetch('/api/users/me/locale', { method: 'PATCH', body: { locale: next } })
      await useUserSession().fetch()
    } catch {
      await setLocale(previous)
      if (import.meta.client) setFormatLocale(previous)
      toast.add({ title: t('common.localeSaveError'), color: 'error' })
    }
  }
  pending.value = false
}

watch(() => user.value?.locale, value => {
  if (!props.persist) return
  if (value && value !== locale.value) { void setLocale(value); if (import.meta.client) setFormatLocale(value) }
}, { immediate: true })
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end', sideOffset: 8 }" :modal="false">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      class="cursor-pointer topbar-action language-switcher"
      :aria-label="$t('common.language')"
      :loading="pending"
    >
      <span class="sr-only sm:not-sr-only">{{ locale.toUpperCase() }}</span>
    </UButton>
  </UDropdownMenu>
</template>
