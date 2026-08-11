import { auditLogs } from '../database/schema'
import { db } from '../database/client'

export async function writeAuditLog(input: {
  organizationId: string
  actorId?: string
  action: string
  entityType: string
  entityId: string
  payload?: Record<string, unknown>
}) {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? {}
  })
}
