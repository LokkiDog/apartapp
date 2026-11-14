import { z } from 'zod'

const reply = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(1800),
}).refine(value => !value.enabled || Boolean(value.text), { path: ['text'] })

const channel = z.object({ welcome: reply, away: reply })
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

export const messagingAutomationSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  opens: time,
  closes: time,
  telegram: channel,
  line: channel,
}).refine(value => value.opens < value.closes, { path: ['closes'] })

export type MessagingAutomation = z.infer<typeof messagingAutomationSchema>

export function defaultMessagingAutomation(): MessagingAutomation {
  return {
    days: [1, 2, 3, 4, 5],
    opens: '09:00',
    closes: '18:00',
    telegram: { welcome: { enabled: false, text: '' }, away: { enabled: false, text: '' } },
    line: { welcome: { enabled: false, text: '' }, away: { enabled: false, text: '' } },
  }
}
