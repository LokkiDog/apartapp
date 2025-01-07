import { defineStore } from 'pinia'
import type { Apart } from '@/types/apart.types'
import apartService from '@/services/apart.service'

export const useApartStore = defineStore('apart', {
    state: () => ({
        aparts: [] as Apart[],
        loading: false,
        error: null as string | null,
    }),

    getters: {
        getApartById: (state) => (id: number) => state.aparts.find((apart) => apart.id === id),

        getComplexes: (state) => {
            console.log(state.aparts)
            return [...new Set(state.aparts.map((apart) => apart.complex))]
        },
    },

    actions: {
        async fetchAparts() {
            this.loading = true
            try {
                this.aparts = await apartService.getAll()
            } catch (error) {
                this.error = 'Ошибка при загрузке апартаментов'
                throw error
            } finally {
                this.loading = false
            }
        },

        async createApart(apartData: Omit<Apart, 'id'>) {
            this.loading = true
            this.error = null
            try {
                const formData = new FormData()
                if (apartData.image) {
                    formData.append('image', apartData.image)
                }
                const newApart = await apartService.create(apartData)
                this.aparts = [...this.aparts, newApart]
                return newApart
            } catch (error) {
                this.error = 'Ошибка при создании апартамента'
                throw error
            } finally {
                this.loading = false
            }
        },

        async deleteApart(id: number) {
            try {
                await apartService.delete(id)
                this.aparts = this.aparts.filter((apart) => apart.id !== id)
            } catch (error) {
                this.error = 'Ошибка при удалении апартамента'
                throw error
            }
        },
    },
})
