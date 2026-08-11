import { z } from 'zod'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { pushSubscriptions } from '../../infrastructure/database/schema'
const schema = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) })
export default defineEventHandler(async event => { const actor = await requireActor(event); const data = schema.parse(await readBody(event)); await db.insert(pushSubscriptions).values({ userId: actor.id, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: actor.id, p256dh: data.keys.p256dh, auth: data.keys.auth, updatedAt: new Date() } }); return { ok: true } })
