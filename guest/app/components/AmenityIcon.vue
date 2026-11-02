<script setup lang="ts">
import { amenityGroups } from '../../../shared/contracts/amenities'
defineProps<{ code: string }>()
const groupByCode = new Map<string, string>(amenityGroups.flatMap(group => group.codes.map(code => [code, group.key] as const)))
const groupPaths: Record<string, string> = {
  essentials: 'M4 4h16v12H4zM8 20h8M12 16v4',
  kitchen: 'M4 3v6a3 3 0 0 0 6 0V3M7 3v19M20 22V3c-5 2-5 10 0 10',
  bathroom: 'M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V5a3 3 0 0 1 6 0M7 20v2m10-2v2',
  bedroom: 'M3 18V8m18 10V8M3 14h18v6H3zM5 14V9h6v5m2 0V9h6v5',
  outdoor: 'M3 21h18M12 3 4 15h16zM12 15v6',
  building: 'M5 21V3h14v18M2 21h20M9 7h1m4 0h1m-6 4h1m4 0h1M10 21v-6h4v6',
  services: 'M8 10V6a4 4 0 0 1 8 0v4M4 10h16v11H4zM12 14v3',
  safety: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6',
}
const paths: Record<string, string> = {
  wifi: 'M2 8.8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0M12 19h.01',
  pool: 'M8 16V5a2 2 0 0 1 4 0m4 11V5a2 2 0 0 1 4 0M8 9h8M8 13h8M2 19q2-2 4 0t4 0t4 0t4 0t4 0',
  parking: 'M9 17V7h4a3 3 0 0 1 0 6H9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  air_conditioning: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1',
  kitchen: 'M4 3v6a3 3 0 0 0 6 0V3M7 3v19M20 22V3c-5 2-5 10 0 10',
  balcony: 'M3 12h18M3 20h18M5 12v8m5-8v8m4-8v8m5-8v8M6 9V3h12v6M12 3v6',
  washing_machine: 'M4 3h16v18H4zM7 6h.01M10 6h.01M16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0M8 14q2-2 4 0t4 0',
  lift: 'M3 3h18v18H3zM8 7v10m-2-8 2-2 2 2M16 7v10m-2-2 2 2 2-2',
  ski_storage: 'M6 3l10 17q1 2 3 0M18 3 8 20q-1 2-3 0M4 5l16 14M20 5 4 19',
}
</script>
<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[code] || groupPaths[groupByCode.get(code) || 'essentials']" /></svg></template>
