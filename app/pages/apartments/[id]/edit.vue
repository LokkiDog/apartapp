<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

import { ApartmentEditPage } from '#fsd/pages/apartments'
</script>

<template>
  <ApartmentEditPage />
</template>
