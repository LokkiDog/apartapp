<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

import { ApartmentsPage } from '#fsd/pages/apartments'
</script>

<template>
  <ApartmentsPage />
</template>
