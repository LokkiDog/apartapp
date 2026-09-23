import { z } from 'zod'

export const sendNotificationSchema = z.object({
  audience: z.enum(['all', 'administrators', 'cleaners', 'users']),
  userIds: z.array(z.uuid()).max(500).default([]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000)
}).strict().superRefine((value, context) => {
  if (value.audience === 'users' && !value.userIds.length) {
    context.addIssue({ code: 'custom', path: ['userIds'], message: 'Выберите получателей' })
  }
  if (value.audience !== 'users' && value.userIds.length) {
    context.addIssue({ code: 'custom', path: ['userIds'], message: 'Список пользователей доступен только при адресной отправке' })
  }
})

type Audience = z.infer<typeof sendNotificationSchema>['audience']
type Candidate = { id: string; organizationId: string; status: string; roles: string[] }

export function selectManualRecipients(candidates: Candidate[], organizationId: string, audience: Audience, userIds: string[]) {
  const selectedIds = new Set(userIds)
  const recipients = candidates.filter(user => {
    if (user.organizationId !== organizationId || user.status !== 'active') return false
    if (audience === 'all') return true
    if (audience === 'administrators') return user.roles.includes('administrator')
    if (audience === 'cleaners') return user.roles.includes('cleaner')
    return selectedIds.has(user.id)
  })
  return { recipients, allSelectedActive: audience !== 'users' || recipients.length === selectedIds.size }
}
