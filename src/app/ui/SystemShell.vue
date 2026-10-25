<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import PasskeySettings from './PasskeySettings.vue'
const user = useCurrentUser()
const error = ref('')
async function logout() {
  try { await $fetch('/api/auth/logout', { method: 'POST' }); await useUserSession().clear(); await navigateTo('/login') }
  catch { error.value = 'Не удалось выйти' }
}
</script>
<template>
  <div class="mx-auto max-w-6xl px-4 py-6 md:px-8">
    <header class="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-line)] pb-4">
      <div><strong class="text-xl">Aparts · Система</strong><p class="text-sm text-[var(--color-muted)]">{{ user?.name }}</p></div>
      <nav class="flex flex-wrap gap-2">
        <PasskeySettings />
        <UButton to="/system/clients" color="neutral" variant="soft" class="min-h-11 cursor-pointer">Клиенты</UButton>
        <UButton to="/system/settings" color="neutral" variant="soft" class="min-h-11 cursor-pointer">Настройки</UButton>
        <UButton color="neutral" variant="ghost" class="min-h-11 cursor-pointer" @click="logout">Выйти</UButton>
      </nav>
    </header>
    <UAlert v-if="error" :description="error" color="error" class="mb-4" />
    <slot />
  </div>
</template>
