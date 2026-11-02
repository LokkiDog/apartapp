import { z } from 'zod'
import { amenityCodes } from './amenities'
export { amenityCodes, amenityGroups, type AmenityCode, type AmenityGroupKey } from './amenities'

export const publicationTranslationLocales = ['en', 'he', 'bg'] as const
export const publicCopyFields = ['title', 'summary', 'description', 'location'] as const
export type PublicationTranslationLocale = typeof publicationTranslationLocales[number]

export const publicCopySchema = z.object({
  title: z.string().trim().max(160).default(''),
  summary: z.string().trim().max(400).default(''),
  description: z.string().trim().max(12000).default(''),
  location: z.string().trim().max(2000).default('')
}).strict()
export type PublicCopy = z.infer<typeof publicCopySchema>
export const publicationTranslationInputSchema = z.object({ source: publicCopySchema }).strict()
  .refine(value => publicCopyFields.some(field => value.source[field].trim()), { message: 'Добавьте текст для перевода' })
export const publicationTranslationResultSchema = z.object({ en: publicCopySchema, he: publicCopySchema, bg: publicCopySchema }).strict()
export type PublicationTargetTranslations = z.infer<typeof publicationTranslationResultSchema>

export const publicationInputSchema = z.object({
  published: z.boolean(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  translations: z.object({ ru: publicCopySchema, en: publicCopySchema.optional(), he: publicCopySchema.optional(), bg: publicCopySchema.optional() }).strict(),
  amenities: z.array(z.enum(amenityCodes)).max(amenityCodes.length).default([]),
  photoIds: z.array(z.string().uuid()).max(100).default([])
}).strict().superRefine((data, ctx) => {
  if (new Set(data.photoIds).size !== data.photoIds.length) ctx.addIssue({ code: 'custom', path: ['photoIds'], message: 'Фотографии не должны повторяться' })
  if (data.published) {
    for (const key of ['title', 'summary', 'description'] as const) {
      if (!data.translations.ru[key]) ctx.addIssue({ code: 'custom', path: ['translations', 'ru', key], message: 'Заполните поле для публикации' })
    }
  }
})
export type PublicationInput = z.infer<typeof publicationInputSchema>
export type PublicMapLocation = {
  hotelId: string
  hotelName: string
  latitude: number
  longitude: number
}
export type PublicApartment = {
  hotel: { id: string, name: string } | null
  mapLocation: PublicMapLocation | null
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
