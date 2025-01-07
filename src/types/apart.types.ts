export interface Point {
    lat: number
    lng: number
}

export interface Apart {
    id?: number // Опциональный для формы создания
    name: string
    complex: string
    persons: number
    coords: Point
    image: string | File | null // Может быть строкой URL или File при создании
}
