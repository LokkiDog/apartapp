import type { Apart } from '@/types/apart.types'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useApartStore = defineStore('aparts', () => {
    const aparts = ref<Apart[]>([])

    async function loadAparts() {
        try {
            const response = await fetch('your-api-endpoint')
            const data = await response.json()
            aparts.value = Array.isArray(data) ? data : []
        } catch (error) {
            console.error('Error loading aparts:', error)
            aparts.value = []
        }
    }

    return {
        aparts,
        loadAparts,
    }
})
