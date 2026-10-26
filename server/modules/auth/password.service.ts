import { and, eq, ne } from 'drizzle-orm'
import { createError } from 'h3'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { authTokens, passkeyChallenges, platformSessions, users } from '../../infrastructure/database/schema'

export async function changeOwnPassword(actor: Actor, currentPassword: string, newPassword: string) {
  // Credentials belong to the signed-in principal, including superusers in a client context.
  const user = await db.query.users.findFirst({ where: and(eq(users.id, actor.id), eq(users.status, 'active'), actor.isSuperuser ? undefined : eq(users.organizationId, actor.organizationId)) })
  if (!user || !await verifyPassword(user.passwordHash, currentPassword)) {
    throw createError({ statusCode: 400, statusMessage: 'Неверный текущий пароль', data: { code: 'INCORRECT_PASSWORD' } })
  }
  const passwordHash = await hashPassword(newPassword)
  await db.transaction(async tx => {
    // Compare the hash as well: concurrent changes must not overwrite a newer password.
    const [changed] = await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(and(
      eq(users.id, actor.id), eq(users.organizationId, user.organizationId), eq(users.status, 'active'), eq(users.passwordHash, user.passwordHash)
    )).returning({ id: users.id })
    if (!changed) throw createError({ statusCode: 409, statusMessage: 'Пароль уже изменён. Попробуйте ещё раз' })
    await tx.delete(platformSessions).where(and(eq(platformSessions.userId, actor.id), actor.platformSessionId ? ne(platformSessions.id, actor.platformSessionId) : undefined))
    await tx.delete(authTokens).where(and(eq(authTokens.userId, actor.id), eq(authTokens.type, 'password_reset')))
    await tx.delete(passkeyChallenges).where(and(eq(passkeyChallenges.userId, actor.id), eq(passkeyChallenges.purpose, 'register')))
  })
  return { ok: true }
}
