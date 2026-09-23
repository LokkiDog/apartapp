import { describe, expect, it } from 'vitest'
import { selectManualRecipients, sendNotificationSchema } from '../server/infrastructure/notification/manual'

const organizationId = 'organization-a'
const ids = {
  sender: '11111111-1111-4111-8111-111111111111',
  admin: '22222222-2222-4222-8222-222222222222',
  cleaner: '33333333-3333-4333-8333-333333333333',
  specialist: '44444444-4444-4444-8444-444444444444',
  manager: '55555555-5555-4555-8555-555555555555',
  invited: '66666666-6666-4666-8666-666666666666',
  blocked: '77777777-7777-4777-8777-777777777777',
  foreign: '88888888-8888-4888-8888-888888888888'
}
const candidates = [
  { id: ids.sender, organizationId, status: 'active', roles: ['administrator'] },
  { id: ids.admin, organizationId, status: 'active', roles: ['administrator'] },
  { id: ids.cleaner, organizationId, status: 'active', roles: ['cleaner'] },
  { id: ids.specialist, organizationId, status: 'active', roles: ['specialist'] },
  { id: ids.manager, organizationId, status: 'active', roles: ['manager'] },
  { id: ids.invited, organizationId, status: 'invited', roles: ['cleaner'] },
  { id: ids.blocked, organizationId, status: 'blocked', roles: ['administrator'] },
  { id: ids.foreign, organizationId: 'organization-b', status: 'active', roles: ['cleaner'] }
]

describe('manual notification recipients', () => {
  it('selects only active users in the sender organization for each group', () => {
    expect(selectManualRecipients(candidates, organizationId, 'all', []).recipients.map(user => user.id))
      .toEqual([ids.sender, ids.admin, ids.cleaner, ids.specialist, ids.manager])
    expect(selectManualRecipients(candidates, organizationId, 'administrators', []).recipients.map(user => user.id))
      .toEqual([ids.sender, ids.admin])
    expect(selectManualRecipients(candidates, organizationId, 'cleaners', []).recipients.map(user => user.id))
      .toEqual([ids.cleaner])
  })

  it('accepts active specific users of any role and rejects inaccessible selections', () => {
    const selected = selectManualRecipients(candidates, organizationId, 'users', [ids.manager, ids.cleaner, ids.manager])
    expect(selected.recipients.map(user => user.id)).toEqual([ids.cleaner, ids.manager])
    expect(selected.allSelectedActive).toBe(true)
    for (const id of [ids.invited, ids.blocked, ids.foreign]) {
      expect(selectManualRecipients(candidates, organizationId, 'users', [id]).allSelectedActive).toBe(false)
    }
  })

  it('requires content and explicit recipients only in the users mode', () => {
    expect(sendNotificationSchema.safeParse({ audience: 'all', title: ' Тема ', body: ' Текст ' }).success).toBe(true)
    expect(sendNotificationSchema.safeParse({ audience: 'users', userIds: [], title: 'Тема', body: 'Текст' }).success).toBe(false)
    expect(sendNotificationSchema.safeParse({ audience: 'all', userIds: [ids.cleaner], title: 'Тема', body: 'Текст' }).success).toBe(false)
    expect(sendNotificationSchema.safeParse({ audience: 'users', userIds: [ids.cleaner], title: ' ', body: 'Текст' }).success).toBe(false)
    expect(sendNotificationSchema.safeParse({ audience: 'users', userIds: [ids.cleaner], title: 'Тема', body: ' ' }).success).toBe(false)
  })
})
