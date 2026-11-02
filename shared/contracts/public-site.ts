import { z } from 'zod'

export const publicBioSchema = z.object({
  ru: z.string().trim().max(4000).default(''), en: z.string().trim().max(4000).default(''),
  he: z.string().trim().max(4000).default(''), bg: z.string().trim().max(4000).default('')
}).strict()
export type PublicBio = z.infer<typeof publicBioSchema>
export const contactPhoneSchema = z.string().trim().max(40).refine(value => !value || /^\+?[1-9][0-9]{6,14}$/.test(value.replace(/[\s()+-]/g, '')), 'Неверный номер телефона')
// A site is selected by its exact origin, never by a client-supplied organization ID.
export const websiteUrlSchema = z.string().trim().max(300).transform((value, ctx) => {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error()
    return url.origin
  } catch { ctx.addIssue({ code: 'custom', message: 'Укажите адрес сайта без пути' }); return z.NEVER }
})
export const publicSiteInputSchema = z.object({
  enabled: z.boolean(), websiteUrl: websiteUrlSchema,
  hostUserId: z.string().uuid().nullable()
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.hostUserId) ctx.addIssue({ code: 'custom', path: ['hostUserId'], message: 'Выберите профиль' })
})
export type PublicSiteInput = z.infer<typeof publicSiteInputSchema>
export type PublicSite = { websiteUrl: string; hostName: string; whatsapp: string; hostPhoto: string; hostDescription: PublicBio }
export type OwnProfile = { name: string; phone: string; publicBio: PublicBio; hasPhoto: boolean; photoVersion: string }
export type PublicSiteSettings = { settings: PublicSiteInput; profiles: Array<{ id: string; name: string; phone: string; hasPhoto: boolean }> }
