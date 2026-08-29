import { and, eq, inArray, max } from 'drizzle-orm'
import { requireRole, requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { authTokens, users } from '../../infrastructure/database/schema'
import { invitationResendAvailableAt } from '../../modules/auth/invitation-cooldown'
export default defineEventHandler(async event => {
  const actor = await requireActor(event); requireRole(actor, 'administrator')
  const members = await db.query.users.findMany({ where: eq(users.organizationId, actor.organizationId), columns: { passwordHash: false }, orderBy: (users, { asc }) => [asc(users.name)] })
  const invitedUserIds = members.filter(member => member.status === 'invited').map(member => member.id)
  const latestInvitations = invitedUserIds.length
    ? await db.select({ userId: authTokens.userId, sentAt: max(authTokens.createdAt) }).from(authTokens).where(and(inArray(authTokens.userId, invitedUserIds), eq(authTokens.type, 'invitation'))).groupBy(authTokens.userId)
    : []
  const invitationSentAt = new Map(latestInvitations.map(invitation => [invitation.userId, invitation.sentAt]))
  return members.map(member => {
    const sentAt = invitationSentAt.get(member.id)
    return { ...member, invitationResendAvailableAt: sentAt ? invitationResendAvailableAt(sentAt).toISOString() : null }
  })
})
