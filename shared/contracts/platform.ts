import { z } from 'zod'
export const emailSchema = z.string().trim().toLowerCase().email().max(254)
export const registrationModeSchema = z.enum(['self_service', 'superuser_only'])
export const timezoneSchema = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}, 'Неверный часовой пояс')
export const clientInputSchema = z.object({
  name: z.string().trim().min(2).max(200), timezone: timezoneSchema.default('Europe/Sofia'),
  administratorName: z.string().trim().min(2).max(200), email: emailSchema
})
export const clientUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(), timezone: timezoneSchema.optional(), status: z.enum(['active', 'blocked']).optional()
}).strict()
export const registrationInputSchema = z.object({
  companyName: z.string().trim().min(2).max(200), name: z.string().trim().min(2).max(200),
  email: emailSchema, password: z.string().min(8).max(200)
})
export const administratorInputSchema = z.object({ name: z.string().trim().min(2).max(200), email: emailSchema })
export const confirmationSchema = z.object({ token: z.string().min(20).max(200) })
export type RegistrationMode = z.infer<typeof registrationModeSchema>
export interface PlatformClient {
  id: string; name: string; timezone: string; status: 'active' | 'blocked'; createdAt: string;
  administrators: Array<{ id: string; name: string; email: string; status: string; isSuperuser: boolean }>;
  invitationSent?: boolean
}
