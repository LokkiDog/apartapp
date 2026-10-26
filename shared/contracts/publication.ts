import { z } from 'zod'

export const amenityCodes = ['wifi', 'kitchen', 'parking', 'balcony', 'washing_machine', 'air_conditioning', 'ski_storage', 'pool', 'lift'] as const
export const publicCopySchema = z.object({
  title: z.string().trim().max(160).default(''),
  summary: z.string().trim().max(400).default(''),
  description: z.string().trim().max(12000).default(''),
  location: z.string().trim().max(2000).default('')
}).strict()
export const publicationInputSchema = z.object({
  published: z.boolean(),
  slug: z.string().trim().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  translations: z.object({ ru: publicCopySchema, en: publicCopySchema.optional(), bg: publicCopySchema.optional() }).strict(),
  amenities: z.array(z.enum(amenityCodes)).max(amenityCodes.length).default([]),
  photoIds: z.array(z.string().uuid()).max(100).default([])
}).strict().superRefine((data, ctx) => {
  if (new Set(data.photoIds).size !== data.photoIds.length) ctx.addIssue({ code: 'custom', path: ['photoIds'], message: 'Фотографии не должны повторяться' })
  if (data.published) {
    for (const key of ['title', 'summary', 'description'] as const) {
      if (!data.translations.ru[key]) ctx.addIssue({ code: 'custom', path: ['translations', 'ru', key], message: 'Заполните поле для публикации' })
    }
    if (!data.photoIds.length) ctx.addIssue({ code: 'custom', path: ['photoIds'], message: 'Выберите хотя бы одно фото' })
  }
})
export type PublicationInput = z.infer<typeof publicationInputSchema>
export type PublicApartment = {
  slug: string
  title: string
  summary: string
  description: string
  location: string
  capacity: number
  rooms: number
  checkInTime: string
  checkOutTime: string
  amenities: string[]
  photos: Array<{ id: string, url: string }>
}
