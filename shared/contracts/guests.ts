import { z } from 'zod'

export const guestEmailSchema = z.string().trim().max(254).pipe(z.union([z.email(), z.literal('')]))
export const guestInputSchema = z.object({
  name: z.string().trim().max(160),
  phone: z.string().trim().max(50),
  email: guestEmailSchema,
  whatsapp: z.string().trim().max(50).regex(/^(?:\+[1-9]\d{6,14})?$/),
  notes: z.string().trim().max(2000),
}).refine(guest => Boolean(guest.name || guest.phone || guest.email || guest.whatsapp), { path: ['name'], message: 'Укажите имя или контакт' })

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
export type GuestDetail = GuestSummary & {
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
