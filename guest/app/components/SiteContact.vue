<script setup lang="ts">
const props = defineProps<{ title?: string, slug?: string, label?: string }>()
const { contact, copy } = useSite()
const route = useRoute()
const { current, request } = useApartmentEnquiry()
function clicked(event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const apartment = props.title && props.slug ? { title: props.title, slug: props.slug }
    : route.path.startsWith('/apartments/') && current.value?.slug === route.params.slug ? current.value : null
  if (apartment) { event.preventDefault(); (event.currentTarget as HTMLElement)?.focus(); request(apartment) }
}
</script>
<template>
  <a v-if="contact(title, slug)" :href="contact(title, slug)" class="button" target="_blank" rel="noopener noreferrer" @click="clicked">{{ label || copy.dates }}</a>
  <span v-else class="contact-pending">{{ copy.contactPending }}</span>
</template>
