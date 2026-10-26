import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'
import { profileUpdateSchema } from '@contracts/platform'

export async function updateOwnProfile(actor: Actor, input: unknown) {
  const { name } = profileUpdateSchema.parse(input)
  // Profile ownership follows the principal, including superusers supporting a client.
  const [user] = await db.update(users).set({ name, updatedAt: new Date() }).where(and(
    eq(users.id, actor.id), eq(users.status, 'active'), actor.isSuperuser ? undefined : eq(users.organizationId, actor.organizationId)
  )).returning({ name: users.name })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  return user
}
