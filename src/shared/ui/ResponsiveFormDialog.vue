<script setup lang="ts">
import { UModal, USlideover } from '#components'
import type { VNode } from 'vue'

withDefaults(defineProps<{
  title: string
  description?: string
  dismissible?: boolean
  modal?: boolean
  overlay?: boolean
}>(), { dismissible: true, modal: true, overlay: true })

defineSlots<{
  body(props: { close: () => void }): VNode[]
  footer?(props: { close: () => void }): VNode[]
}>()

const open = defineModel<boolean>('open', { required: true })
const desktop = ref(false)
const desktopQuery = '(min-width: 1024px)'

function selectPresentation() {
  desktop.value = window.matchMedia(desktopQuery).matches
}

onMounted(() => {
  if (open.value) selectPresentation()
})

watch(open, (isOpen) => {
  if (isOpen && import.meta.client) selectPresentation()
})

const dialog = computed(() => desktop.value ? UModal : USlideover)
const desktopUi = {
  content: 'max-h-[calc(100dvh-2rem)] max-w-lg overflow-hidden',
  header: 'shrink-0',
  body: 'min-h-0 overscroll-contain',
  footer: 'shrink-0'
}
</script>

<template>
  <component
    :is="dialog"
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :modal="modal"
    :overlay="overlay"
    :ui="desktop ? desktopUi : undefined"
  >
    <template #body="slotProps">
      <slot name="body" v-bind="slotProps" />
    </template>
    <template v-if="$slots.footer" #footer="slotProps">
      <slot name="footer" v-bind="slotProps" />
    </template>
  </component>
</template>
