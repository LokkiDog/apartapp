// Point of object on map
export interface Point {
    lat: number
    lng: number
}

export interface Complex {
    apart_name: string
    complex_name: string
    complex_point: Point
    persons: number
}

export interface Apart {
    id?: number
    name: string
    complex: string
    persons: number
    coords: Point
    image: string | File
}
