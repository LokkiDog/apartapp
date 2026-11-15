<script setup lang="ts">
import { AiAgentConsentPage } from '#fsd/pages/settings'

definePageMeta({ layout: 'auth' })
useResponseHeader('Cache-Control').value = 'no-store'
useResponseHeader('Referrer-Policy').value = 'no-referrer'
useResponseHeader('Content-Security-Policy').value = "frame-ancestors 'none'"
</script>

<template><AiAgentConsentPage /></template>
