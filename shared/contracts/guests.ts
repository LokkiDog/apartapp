import { z } from 'zod'

export const guestEmailSchema = z.string().trim().max(254).pipe(z.union([z.email(), z.literal('')]))
const additionalEmailSchema = z.string().trim().max(254).pipe(z.email())
const whatsappSchema = z.string().trim().max(50).regex(/^\+[1-9]\d{6,14}$/)
export const guestNotesSchema = z.object({ notes: z.string().trim().max(2000) })
export const guestInputSchema = z.object({
  name: z.string().trim().max(160),
  phone: z.string().trim().max(50),
  email: guestEmailSchema,
  whatsapp: z.string().trim().max(50).regex(/^(?:\+[1-9]\d{6,14})?$/),
  additionalPhones: z.array(z.string().trim().min(1).max(50).refine(value => Boolean(normalizeGuestPhone(value)))).max(30).optional(),
  additionalEmails: z.array(additionalEmailSchema).max(30).optional(),
  additionalWhatsapps: z.array(whatsappSchema).max(30).optional(),
  ...guestNotesSchema.shape,
}).refine(guest => Boolean(guest.name || guest.phone || guest.email || guest.whatsapp || guest.additionalPhones?.length || guest.additionalEmails?.length || guest.additionalWhatsapps?.length), { path: ['name'], message: 'Укажите имя или контакт' })

export type GuestInput = z.input<typeof guestInputSchema>
export type GuestSummary = Pick<GuestInput, 'name' | 'phone' | 'email' | 'whatsapp'> & { id: string }
export type GuestStay = {
  id: string
  guestId: string | null
  apartmentName: string
  guestName: string
  checkInOn: string
  checkOutOn: string
  state: string
}
export type GuestConversation = {
  id: string
  contactId: string
  guestId: string | null
  channel: 'telegram' | 'line'
  name: string
  username: string
}
export type GuestConversationList = { items: GuestConversation[]; hasMore: boolean }
export type GuestDetail = GuestSummary & Pick<GuestInput, 'additionalPhones' | 'additionalEmails' | 'additionalWhatsapps'> & {
  notes: string
  stays: GuestStay[]
  conversations: GuestConversation[]
}

export function normalizeGuestPhone(value: string) {
  const cleaned = value.trim().replace(/[\s().-]/g, '').replace(/^00/, '+')
  return /^\+?\d+$/.test(cleaned) ? cleaned : null
}

export const guestListQuerySchema = z.object({
  q: z.string().trim().max(160).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
})
export const guestConversationListQuerySchema = guestListQuerySchema.extend({
  channel: z.enum(['telegram', 'line']).optional(),
})
export const guestLinkSchema = z.object({ id: z.uuid(), linked: z.boolean() })

export const conversationGuestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), guestId: z.uuid() }),
  z.object({ action: z.literal('create'), guest: guestInputSchema }),
])
