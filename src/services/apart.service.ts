import type { Apart } from '@/types/apart.types'

export const mockAparts: Apart[] = [
    {
        id: 1,
        name: 'Уютная квартира',
        complex: 'Зеленый квартал',
        persons: 4,
        coords: {
            lat: 55.751244,
            lng: 37.618423,
        },
        image: 'https://randomfox.ca/images/1.jpg',
    },
    {
        id: 2,
        name: 'Просторная студия',
        complex: 'Солнечный',
        persons: 2,
        coords: {
            lat: 55.755819,
            lng: 37.617644,
        },
        image: 'https://randomfox.ca/images/2.jpg',
    },
    {
        id: 3,
        name: 'Семейные апартаменты',
        complex: 'Зеленый квартал',
        persons: 6,
        coords: {
            lat: 55.753215,
            lng: 37.622504,
        },
        image: 'https://randomfox.ca/images/3.jpg',
    },
]

export class ApartService {
    async getAll(): Promise<Apart[]> {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return mockAparts
    }

    async getById(id: number): Promise<Apart | undefined> {
        await new Promise((resolve) => setTimeout(resolve, 300))
        return mockAparts.find((apart) => apart.id === id)
    }

    async getByComplex(complex: string): Promise<Apart[]> {
        await new Promise((resolve) => setTimeout(resolve, 300))
        return mockAparts.filter((apart) => apart.complex === complex)
    }

    async create(apartData: Omit<Apart, 'id'>): Promise<Apart> {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const newApart: Apart = {
            ...apartData,
            id: Math.max(...mockAparts.map((a) => a.id ?? 0)) + 1,
        }
        mockAparts.push(newApart)
        return newApart
    }

    async delete(id: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 300))
        const index = mockAparts.findIndex((apart) => apart.id === id)
        if (index === -1) {
            throw new Error('Апартамент не найден')
        }
        mockAparts.splice(index, 1)
    }
}

export default new ApartService()
