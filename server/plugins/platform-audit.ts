import { getMethod, getRequestURL } from 'h3'
import { db } from '../infrastructure/database/client'
import { platformAuditLogs } from '../infrastructure/database/schema'
import type { Actor } from '../infrastructure/auth/actor'

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('afterResponse', async event => {
    const actor = event.context.platformActor as Actor | undefined
    const method = getMethod(event)
    if (!actor?.isSuperuser || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return
    // Detailed domain logs remain unchanged; this captures support mutations
    // even for older endpoints that do not yet have their own domain audit.
    try {
      await db.insert(platformAuditLogs).values({
        actorId: actor.id, organizationId: actor.organizationId,
        action: event.node.res.statusCode < 400 ? 'client.operation_completed' : 'client.operation_failed',
        payload: { method, path: getRequestURL(event).pathname, status: event.node.res.statusCode }
      })
    } catch (error) { console.error('[platform-audit] support operation audit failed', error) }
  })
})
