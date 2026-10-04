import { z } from 'zod'
import { requireSuperuser, requirePrincipal } from '../../infrastructure/auth/platform'
import { selectClient } from '../../modules/platform/platform.service'
export default defineEventHandler(async event => { const actor = await requireSuperuser(event); const data = z.object({ organizationId: z.string().uuid().nullable() }).parse(await readBody(event)); await selectClient(actor, data.organizationId); return { user: await requirePrincipal(event) } })
