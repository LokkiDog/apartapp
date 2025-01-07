<template>
    <Card class="relative">
        <template #header>
            <img :src="apart.image" class="w-full h-48 object-cover" :alt="apart.name" />
        </template>
        <template #title>{{ apart.name }}</template>
        <template #content>
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <i class="pi pi-building" />
                    <!-- иконка для комплекса -->
                    {{ apart.complex }}
                </div>
                <div class="flex items-center gap-2">
                    <i class="pi pi-users" />
                    <!-- иконка для количества человек -->
                    {{ apart.persons }} чел.
                </div>
                <div class="flex items-center gap-2">
                    <i class="pi pi-map-marker" />
                    <!-- иконка для координат -->
                    {{ apart.coords.lat }}, {{ apart.coords.lng }}
                </div>
            </div>
        </template>
        <template #footer>
            <!-- <Button icon="pi pi-trash" severity="danger" @click="$emit('delete', apart.id)" /> -->
        </template>
    </Card>
</template>

<script setup lang="ts">
import type { Apart } from '@/types/apart.types'
import CoordsElement from '@/components/features/map/CoordsElement.vue'

defineProps<{
    apart: Apart
}>()

defineEmits<{
    (e: 'delete', id: number): void
}>()
</script>
