import { z } from 'zod'

export const MAX_MESSAGE_FILE_BYTES = 20 * 1024 * 1024
export const telegramConnectionSchema = z
  .object({
    token: z
      .string()
      .trim()
      .regex(/^\d+:[A-Za-z0-9_-]{20,}$/)
      .max(200),
  })
  .strict()
export type MessagingChannel = 'telegram' | 'line'
export const lineConnectionSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  secret: z.string().trim().regex(/^[a-f0-9]{32}$/i),
}).strict()
export interface LineConnection extends MessagingConnection {
  pending: boolean
  webhookUrl: string | null
}

export const messageInputSchema = z
  .object({
    requestId: z.uuid(),
    text: z.string().trim().max(4096).default(''),
  })
  .strict()
export const conversationLinkSchema = z
  .object({ stayId: z.uuid().nullable() })
  .strict()
export const messagePageSchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type MessageStatus =
  'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'canceled'
export interface MessagingConnection {
  connected: boolean
  botName: string
  botUsername: string
  url: string | null
}
export interface MessagingConversation {
  channel: MessagingChannel
  id: string
  name: string
  username: string
  unread: number
  lastMessageAt: string
  stayId: string | null
  guestName: string | null
  checkInOn: string | null
  checkOutOn: string | null
  apartmentName: string | null
}
export interface MessagingAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  available: boolean
}
export interface GuestMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  text: string
  unsupported: boolean
  status: MessageStatus
  authorName: string | null
  createdAt: string
  attachments: MessagingAttachment[]
}
