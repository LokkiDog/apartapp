<template>
    <div v-if="point" class="flex flex-col w-auto cursor-pointer" title="Скопировать" @click="copyPointToClipboard">
        <div class="flex justify-between">
            <span>Широта:&nbsp;</span>
            <span>{{ point.lat }}</span>
        </div>
        <div class="flex justify-between">
            <span>Долгота:&nbsp;</span>
            <span>{{ point.lng }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import type { Point } from '@/types/apart.types'

const props = defineProps<{
    point: Point
}>()

const toast = useToast()

const copyPointToClipboard = () => {
    navigator.clipboard.writeText(`${props.point.lat}, ${props.point.lng}`)
    toast.add({
        severity: 'info',
        summary: 'Скопировано',
        detail: `${props.point.lat}, ${props.point.lng}`,
        life: 3000,
    })
}
</script>
