import { z } from 'zod'
import { requireSuperuser } from '../../../../infrastructure/auth/platform'
import { resendClientInvitation } from '../../../../modules/platform/platform.service'
export default defineEventHandler(async event => { const actor = await requireSuperuser(event); const data = z.object({ userId: z.string().uuid() }).parse(await readBody(event)); return resendClientInvitation(actor, getRouterParam(event, 'id')!, data.userId) })
