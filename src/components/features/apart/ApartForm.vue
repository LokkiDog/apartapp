<template>
    <div class="flex flex-col gap-2">
        <h2 class="text-lg font-medium">Добавить апартамент</h2>
        <div>
            <label for="apartName">Название апарта</label>
            <InputText id="apartName" class="w-full" placeholder="H41" v-model="apart_name" />
        </div>
        <div>
            <label for="complexName">Комплекс</label>
            <InputText id="complexName" class="w-full" placeholder="Belvedere" v-model="complex_name" />
        </div>
        <div class="flex flex-col">
            <label for="persons">Спальных мест</label>
            <InputNumber
                id="persons"
                class="max-w-12"
                pt:pcInputText:root="max-w-12"
                placeholder="4"
                showButtons
                buttonLayout="horizontal"
                v-model="persons"
                :min="1"
                :max="10"
                :step="1"
            />
        </div>
        <div class="flex flex-col">
            <label for="persons" class="w-full">Расположение</label>
            <div class="flex flex-wrap gap-2 justify-between items-center">
                <div class="w-3/6">
                    <Button class="text-nowrap" label="Указать местоположение" variant="outlined" @click="$emit('showMap')" />
                </div>
                <CoordsElement v-if="complex_point" :point="complex_point"></CoordsElement>
                <span v-else>Местоположение не выбрано</span>
            </div>
        </div>
        <div>
            <label for="complexName">Изображение</label>
            <ImageUpload ref="imageUpload"></ImageUpload>
        </div>

        <Button label="Добавить" class="mt-5" @click="handleSubmit" />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Point } from '@/interfaces/complex'
import CoordsElement from '@/components/features/map/CoordsElement.vue'
import ImageUpload from '@/components/common/ImageUpload.vue'
import { useToast } from 'primevue/usetoast'

const toast = useToast()

// Form data
const apart_name = ref<string | null>(null)
const complex_name = ref<string | null>(null)
const complex_point = ref<Point | null>(null)
const persons = ref<number | null>(null)

// Refs
const imageUpload = ref()

// Emits
const emit = defineEmits(['showMap', 'submit'])

// Methods
const setPoint = (data: Point) => (complex_point.value = data)

const handleSubmit = () => {
    const imageFile = imageUpload.value?.getFile()

    // Create FormData
    const formData = new FormData()
    formData.append('apart_name', apart_name.value || '')
    formData.append('complex_name', complex_name.value || '')
    formData.append('persons', persons.value?.toString() || '')
    if (complex_point.value) {
        formData.append('latitude', complex_point.value.lat.toString())
        formData.append('longitude', complex_point.value.lng.toString())
    }
    if (imageFile) {
        formData.append('image', imageFile)
    }

    emit('submit', formData)
}

// Expose methods for parent component
defineExpose({
    setPoint,
})
</script>
