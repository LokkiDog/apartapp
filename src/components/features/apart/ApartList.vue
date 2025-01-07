<template>
    <div class="flex flex-col gap-4">
        <div class="flex gap-4 items-center">
            <IconField>
                <InputIcon class="pi pi-search" />
                <InputText v-model="searchQuery" placeholder="Поиск..." class="w-full" />
            </IconField>
            <Select
                v-model="selectedComplex"
                :options="complexes"
                placeholder="Комплекс"
                class="w-[200px]"
                showClear
                @clear="selectedComplex = null"
            />
        </div>

        <ProgressSpinner v-if="loading" class="mx-auto" />

        <div v-else-if="error" class="text-red-500">
            {{ error }}
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ApartCard v-for="apart in filteredAparts" :key="apart.id" :apart="apart" @delete="deleteApart" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAparts } from '@/composables/useAparts'
import ApartCard from '@/components/features/apart/ApartCard.vue'

const { filteredAparts, complexes, searchQuery, selectedComplex, loading, error, fetchAparts, deleteApart } = useAparts()

onMounted(() => {
    fetchAparts()
})
</script>
