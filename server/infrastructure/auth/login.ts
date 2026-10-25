import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { db } from '../database/client'
import { users, organizations, platformSessions } from '../database/schema'
import { refreshUserSession } from './session'
import { sessionExpiry, SESSION_VERSION, requirePrincipal } from './platform'

// Both password and passkey sign-in use the current account/client status and
// replace the previous server session, including a superuser's client context.
export async function loginUser(event: H3Event, userId: string) {
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.status, 'active')) })
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Учётная запись недоступна' })
  const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) })
  if (!organization || (!user.isSuperuser && organization.status !== 'active')) throw createError({ statusCode: 401, statusMessage: 'Клиент заблокирован' })
  const previousSession = await getUserSession(event)
  const previousId = (previousSession.user as { platformSessionId?: string } | undefined)?.platformSessionId
  const context = await db.transaction(async tx => {
    const [created] = await tx.insert(platformSessions).values({ userId: user.id, organizationId: user.isSuperuser ? null : user.organizationId, expiresAt: sessionExpiry() }).returning()
    if (previousId) await tx.delete(platformSessions).where(and(eq(platformSessions.id, previousId), eq(platformSessions.userId, (previousSession.user as { id: string }).id)))
    return created
  })
  if (!context) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать сессию' })
  await refreshUserSession(event, { id: user.id, organizationId: user.organizationId, name: user.name, email: user.email, roles: user.roles, locale: user.locale, platformSessionId: context.id, sessionVersion: SESSION_VERSION })
  return { user: await requirePrincipal(event) }
}
