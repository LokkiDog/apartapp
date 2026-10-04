import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../infrastructure/database/client'
import { users, organizations, platformSessions } from '../../infrastructure/database/schema'
import { refreshUserSession } from '../../infrastructure/auth/session'

import { sessionExpiry, SESSION_VERSION, requirePrincipal } from '../../infrastructure/auth/platform'

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

export default defineEventHandler(async event => {
  const data = schema.parse(await readBody(event))
  const user = await db.query.users.findFirst({ where: and(eq(users.email, data.email.trim().toLowerCase()), eq(users.status, 'active')) })
  if (!user || !(await verifyPassword(user.passwordHash, data.password))) throw createError({ statusCode: 401, statusMessage: 'Неверный email или пароль' })
  const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) })
  if (!organization || (!user.isSuperuser && organization.status !== 'active')) throw createError({ statusCode: 401, statusMessage: 'Клиент заблокирован' })
  const previousSession = await getUserSession(event)
  const previousId = (previousSession.user as { platformSessionId?: string } | undefined)?.platformSessionId
  const context = await db.transaction(async tx => {
    const [created] = await tx.insert(platformSessions).values({ userId: user.id, organizationId: user.isSuperuser ? null : user.organizationId, expiresAt: sessionExpiry() }).returning()
    if (previousId) await tx.delete(platformSessions).where(eq(platformSessions.id, previousId))
    return created
  })
  if (!context) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать сессию' })
  await refreshUserSession(event, { id: user.id, organizationId: user.organizationId, name: user.name, email: user.email, roles: user.roles, locale: user.locale, platformSessionId: context.id, sessionVersion: SESSION_VERSION })
  return { user: await requirePrincipal(event) }
})
