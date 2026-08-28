import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireActor } from '../../../infrastructure/auth/actor'
import { db } from '../../../infrastructure/database/client'
import { users } from '../../../infrastructure/database/schema'

const schema = z.object({ locale: z.enum(['ru', 'en', 'he']) })

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const { locale } = schema.parse(await readBody(event))
  const [user] = await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, actor.id)).returning()
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  await setUserSession(event, { user: { id: user.id, organizationId: user.organizationId, name: user.name, email: user.email, roles: user.roles, locale: user.locale } })
  return { locale: user.locale }
})
