import { z } from 'zod'

export const messagingTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(4096),
})

export type MessagingTemplateInput = z.infer<typeof messagingTemplateSchema>
export type MessagingTemplate = MessagingTemplateInput & { id: string }

export const bookingTemplateFields = ['guestName', 'apartmentName', 'checkInOn', 'checkOutOn'] as const
export type BookingTemplateField = typeof bookingTemplateFields[number]

export function renderBookingTemplate(text: string, values: Partial<Record<BookingTemplateField, string>>) {
  const missing = new Set<BookingTemplateField>()
  const rendered = text.replace(/\{\{(guestName|apartmentName|checkInOn|checkOutOn)\}\}/g, (token, field: BookingTemplateField) => {
    const value = values[field]
    if (value) return value
    missing.add(field)
    return token
  })
  return { text: rendered, missing: [...missing] }
}
