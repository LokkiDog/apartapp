import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

export default defineEventHandler(async event => {
  const data = schema.parse(await readBody(event))
  const user = await db.query.users.findFirst({ where: and(eq(users.email, data.email.toLowerCase()), eq(users.status, 'active')) })
  if (!user || !(await verifyPassword(user.passwordHash, data.password))) throw createError({ statusCode: 401, statusMessage: 'Неверный email или пароль' })
  await setUserSession(event, { user: { id: user.id, organizationId: user.organizationId, name: user.name, email: user.email, roles: user.roles, locale: user.locale } })
  return { user: { id: user.id, name: user.name, email: user.email, roles: user.roles, locale: user.locale } }
})
