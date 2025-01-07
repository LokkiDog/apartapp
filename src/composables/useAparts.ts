import { ref, computed } from 'vue'
import { useApartStore } from '@/stores/apart.store'
import type { Apart } from '@/types/apart.types'

export function useAparts() {
    const store = useApartStore()
    const searchQuery = ref('')
    const selectedComplex = ref<string | null>(null)

    const filteredAparts = computed(() => {
        return store.aparts.filter((apart) => {
            const matchesSearch = apart.name.toLowerCase().includes(searchQuery.value.toLowerCase())
            const matchesComplex = !selectedComplex.value || apart.complex === selectedComplex.value
            return matchesSearch && matchesComplex
        })
    })

    return {
        aparts: computed(() => store.aparts),
        complexes: computed(() => store.getComplexes),
        filteredAparts,
        searchQuery,
        selectedComplex,
        loading: computed(() => store.loading),
        error: computed(() => store.error),
        fetchAparts: () => store.fetchAparts(),
        createApart: (data: Omit<Apart, 'id'>) => store.createApart(data),
        deleteApart: (id: number) => store.deleteApart(id),
    }
}
