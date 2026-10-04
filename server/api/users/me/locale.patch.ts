import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { db } from '../../../infrastructure/database/client'
import { users } from '../../../infrastructure/database/schema'

const schema = z.object({ locale: z.enum(['ru', 'en', 'he']) })

export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  const { locale } = schema.parse(await readBody(event))
  const [user] = await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, actor.id)).returning()
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  await requirePrincipal(event)
  return { locale: user.locale }
})
