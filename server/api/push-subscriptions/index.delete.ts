import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { pushSubscriptions } from '../../infrastructure/database/schema'

const schema = z.object({ endpoint: z.string().url() })

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const { endpoint } = schema.parse(await readBody(event))
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, actor.id), eq(pushSubscriptions.endpoint, endpoint)))
  return { ok: true }
})
