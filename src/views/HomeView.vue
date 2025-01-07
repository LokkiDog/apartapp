<template>
    <Dialog
        v-model:visible="mapModalVisible"
        ref="mapModal"
        modal
        class="min-w-72 w-3/6"
        header="Выберите местопложение"
        :maximizable="true"
    >
        <MapPicker @locationSelected="handleLocationSelected" @closeMap="mapModalVisible = false"></MapPicker>
    </Dialog>

    <div class="container">
        <!-- Mode switcher -->
        <div class="flex justify-center gap-4 mb-8">
            <Button
                :class="{ 'p-button-outlined': currentMode !== 'list' }"
                @click="currentMode = 'list'"
                icon="pi pi-list"
                label="Список апартов"
            />
            <Button
                :class="{ 'p-button-outlined': currentMode !== 'add' }"
                @click="currentMode = 'add'"
                icon="pi pi-plus"
                label="Добавить апарт"
            />
        </div>

        <!-- Content -->
        <div class="flex flex-col md:max-w-6xl mx-auto mt-4">
            <Transition
                mode="out-in"
                enter-active-class="transition ease-out duration-200"
                enter-from-class="opacity-0 -translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition ease-in duration-150"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-2"
            >
                <ApartForm
                    v-if="currentMode === 'add'"
                    ref="apartForm"
                    @submit="handleFormSubmit"
                    @showMap="mapModalVisible = true"
                ></ApartForm>
                <ApartList v-else @edit="handleEdit" @delete="handleDelete" />
            </Transition>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import MapPicker from '@/components/features/map/MapPicker.vue'
//@ts-ignore
import ApartForm from '@/components/features/apart/ApartForm.vue'
import ApartList from '@/components/features/apart/ApartList.vue'
import type { Point } from '@/interfaces/complex'

// Refs
const mapModal = ref()
const apartForm = ref()
const mapModalVisible = ref(false)
const currentMode = ref<'list' | 'add'>('list')

// Methods
const handleLocationSelected = (point: Point) => {
    apartForm.value?.setPoint(point)
    mapModalVisible.value = false
}

const handleFormSubmit = (formData: FormData) => {
    // Handle form submission
    console.log('Form submitted:', formData)
    // Add API call here
    // After successful submission:
    currentMode.value = 'list'
}

const handleEdit = (id: number) => {
    console.log('Edit apart:', id)
}

const handleDelete = (id: number) => {
    console.log('Delete apart:', id)
}

// Lifecycle
onMounted(() => {
    if (window.innerWidth < 996) {
        mapModal.value?.maximize()
    }
})
</script>
