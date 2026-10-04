import { eq } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { platformSessions } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => {
  const session = await getUserSession(event)
  const id = (session.user as { platformSessionId?: string } | undefined)?.platformSessionId
  if (id) await db.delete(platformSessions).where(eq(platformSessions.id, id))
  await clearUserSession(event)
  return { ok: true }
})
