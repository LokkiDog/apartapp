import { z } from 'zod'

export const hotelLocationSearchSchema = z.object({
  text: z.string().trim().min(3).max(200)
}).strict()

export interface HotelLocationResult {
  address: string
  latitude: number
  longitude: number
  attribution: string
  area: boolean
}
