<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'work-access'] })

import { WorkPage } from '#fsd/pages/work'
</script>

<template>
  <WorkPage />
</template>
