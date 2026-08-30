<script setup lang="ts">
import { specialServiceIconOptions, type SpecialServiceIconName } from '#shared/config/special-service-icons'
import { useI18n } from 'vue-i18n'

const model = defineModel<SpecialServiceIconName>({ required: true })
const open = ref(false)
const query = ref('')
const { t, locale } = useI18n()
const selected = computed(() => specialServiceIconOptions.find(option => option.name === model.value) ?? specialServiceIconOptions[0])
const filteredOptions = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase(locale.value)
  if (!normalized) return specialServiceIconOptions
  return specialServiceIconOptions.filter(option => `${option.label} ${option.keywords} ${option.name}`.toLocaleLowerCase(locale.value).includes(normalized))
})

watch(open, value => { if (!value) query.value = '' })
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', sideOffset: 8, collisionPadding: 8 }">
    <template #default>
      <UButton type="button" color="neutral" variant="outline" class="min-h-11 w-full justify-start gap-3 bg-white text-left">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon :name="selected.name" class="size-5" /></span>
        <span class="min-w-0 flex-1 truncate text-left">{{ selected.label }}</span>
        <UIcon name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-[var(--color-muted)]" />
      </UButton>
    </template>
    <template #content>
      <div class="service-icon-picker">
        <UInput v-model="query" class="w-full" :placeholder="t('uiExtra.searchIcon')" icon="i-lucide-search" :aria-label="t('uiExtra.searchIcon')" />
        <div v-if="filteredOptions.length" class="service-icon-picker__grid" :aria-label="t('calendar.extraServices')">
          <button v-for="option in filteredOptions" :key="option.name" type="button" class="service-icon-picker__option" :class="{ 'service-icon-picker__option--selected': model === option.name }" :title="option.label" :aria-label="option.label" @click="model = option.name; open = false">
            <UIcon :name="option.name" class="size-5" />
          </button>
        </div>
        <p v-else class="service-icon-picker__empty">{{ t('uiExtra.noIcons') }}</p>
      </div>
    </template>
  </UPopover>
</template>
