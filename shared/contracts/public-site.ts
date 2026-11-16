import { z } from 'zod'

export const publicBioSchema = z.object({
  ru: z.string().trim().max(4000).default(''), en: z.string().trim().max(4000).default(''),
  he: z.string().trim().max(4000).default(''), bg: z.string().trim().max(4000).default('')
}).strict()
export type PublicBio = z.infer<typeof publicBioSchema>
export const contactPhoneSchema = z.string().trim().max(40).refine(value => !value || /^\+?[1-9][0-9]{6,14}$/.test(value.replace(/[\s()+-]/g, '')), 'Неверный номер телефона')
export const socialPlatforms = ['whatsapp', 'telegram', 'instagram', 'line', 'facebook', 'viber', 'other'] as const
export const socialLabels: Record<typeof socialPlatforms[number], string> = {
  whatsapp: 'WhatsApp', telegram: 'Telegram', instagram: 'Instagram', line: 'LINE', facebook: 'Facebook', viber: 'Viber', other: 'Другое'
}
const webLinkSchema = z.url({ protocol: /^https$/ }).pipe(z.string().refine(value => {
  const url = new URL(value)
  return !url.username && !url.password
}))
export const socialContactSchema = z.object({
  platform: z.enum(socialPlatforms), value: z.string().trim().min(1).max(500)
}).strict().refine(({ platform, value }) => platform === 'whatsapp'
  ? contactPhoneSchema.safeParse(value).success
  : (platform === 'telegram' && /^@[a-zA-Z0-9_]{5,32}$/.test(value)) || webLinkSchema.safeParse(value).success,
{ path: ['value'], message: 'Укажите номер, ссылку HTTPS или имя Telegram' })
export type SocialContact = z.infer<typeof socialContactSchema>
export const socialContactsSchema = z.array(socialContactSchema).max(socialPlatforms.length)
  .refine(contacts => new Set(contacts.map(contact => contact.platform)).size === contacts.length)
export const publicContactKinds = ['phone', ...socialPlatforms] as const
export type PublicContactKind = typeof publicContactKinds[number]
export const emptyPublicBio = () => publicBioSchema.parse({})

// A site is selected by its exact origin, never by a client-supplied organization ID.
export const websiteUrlSchema = z.string().trim().max(300).transform((value, ctx) => {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error()
    return url.origin
  } catch { ctx.addIssue({ code: 'custom', message: 'Укажите адрес сайта без пути' }); return z.NEVER }
})
export const publicSiteZone = 'sites.magicmopcrm.com'
export const publicSiteColors = ['gold', 'blue', 'rose', 'green'] as const
export type PublicSiteColor = typeof publicSiteColors[number]
const reservedSiteNames = new Set(['admin', 'api', 'aparts', 'app', 'crm', 'mail', 'sites', 'support', 'www'])
export const publicSiteSlugSchema = z.string().trim().toLowerCase().refine(value =>
  value === '' || (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 63 && !reservedSiteNames.has(value)),
  'Недопустимый короткий адрес')
export const publicSiteInputSchema = z.object({
  enabled: z.boolean(),
  websiteUrl: z.union([z.literal(''), websiteUrlSchema]).default(''),
  slug: publicSiteSlugSchema.default(''),
  title: z.string().trim().max(100).default(''),
  description: z.string().trim().max(1000).default(''),
  accent: z.enum(publicSiteColors).default('gold'),
  hostUserId: z.string().uuid().nullable(),
  hostDescription: publicBioSchema.default(emptyPublicBio),
  contactKinds: z.array(z.enum(publicContactKinds)).max(publicContactKinds.length).default([])
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.hostUserId) ctx.addIssue({ code: 'custom', path: ['hostUserId'], message: 'Выберите профиль' })
})
export type PublicSiteInput = z.infer<typeof publicSiteInputSchema>
export type PublicSite = {
  websiteUrl: string; hostName: string; whatsapp: string; hostPhoto: string; hostDescription: PublicBio
  phone?: string; socials?: SocialContact[]
  branding?: { title: string; description: string; accent: PublicSiteColor }
}
export type OwnProfile = { currency: import('./currency').Currency; name: string; phone: string; socials: SocialContact[]; hasPhoto: boolean; photoVersion: string }
export type PublicSiteSettings = { settings: PublicSiteInput; addressLocked: boolean; profiles: Array<{ id: string; name: string; phone: string; socials: SocialContact[]; hasPhoto: boolean }> }
