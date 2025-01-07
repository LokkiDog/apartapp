<template>
    <div class="photo-upload w-full">
        <div class="flex justify-between items-center">
            <!-- Left side: Upload controls -->
            <div class="flex gap-2 items-center">
                <Button type="button" label="Загрузить" icon="pi pi-upload" @click="triggerFileInput" :disabled="!!selectedFile" />
                <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="onFileSelect" />
                <Button v-if="selectedFile" type="button" icon="pi pi-times" severity="danger" @click="clearFile" />
            </div>

            <!-- Right side: Preview -->
            <div v-if="previewUrl" class="preview-container">
                <img :src="previewUrl" alt="Предпросмотр изображения" class="preview-image" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, defineExpose } from 'vue'
import Button from 'primevue/button'

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)

const triggerFileInput = () => {
    fileInput.value?.click()
}

const onFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (file) {
        selectedFile.value = file
        const reader = new FileReader()
        reader.onload = (e) => {
            previewUrl.value = e.target?.result as string
        }
        reader.readAsDataURL(file)
    }
}

const clearFile = () => {
    selectedFile.value = null
    previewUrl.value = null
    if (fileInput.value) {
        fileInput.value.value = ''
    }
}

// Экспортируем метод для получения файла из родительского компонента
defineExpose({
    getFile: () => selectedFile.value,
})
</script>

<style>
.photo-upload {
    width: 100%;
}

.preview-container {
    margin-left: 1rem;
}

.preview-image {
    width: 120px;
    object-fit: cover;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 2px;
    background-color: #f9f9f9;
}
</style>
