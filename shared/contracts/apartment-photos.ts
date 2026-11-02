import { z } from 'zod'

export const apartmentPhotoOrderSchema = z.object({
  photoIds: z.array(z.string().uuid()).refine(ids => new Set(ids).size === ids.length, 'Фотографии не должны повторяться')
}).strict()
