<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BookingIntegrationRow from './BookingIntegrationRow.vue'

defineProps<{ apartmentId: string; apartmentName: string }>()
const emit = defineEmits<{ synced: [] }>()
const { t } = useI18n()
</script>

<template>
  <section class="apartment-form-section surface mx-auto w-full max-w-[1040px]" aria-labelledby="apartment-integrations-title">
    <div class="apartment-form-section__header">
      <div class="apartment-form-section__icon"><UIcon name="i-lucide-plug" class="size-5" /></div>
      <h2 id="apartment-integrations-title" class="text-lg font-semibold">{{ t('integrations.title') }}</h2>
    </div>
    <div class="mt-4 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
      <BookingIntegrationRow :apartment-id="apartmentId" :apartment-name="apartmentName" @synced="emit('synced')" />
    </div>
  </section>
</template>
