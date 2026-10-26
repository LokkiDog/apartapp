<script setup lang="ts">
import { LanguageSwitcher } from '#fsd/features/change-language'
withDefaults(defineProps<{ persist?: boolean; labeled?: boolean }>(), { persist: true, labeled: false })
</script>
<template><LanguageSwitcher :persist="persist" :labeled="labeled" /></template>
