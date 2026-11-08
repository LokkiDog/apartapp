import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { organizations } from '../../infrastructure/database/schema'
import {
  requireActor,
  requireRole,
  type Actor,
} from '../../infrastructure/auth/actor'

export function assertMessagingEnabled(
  organization: { status: string; messagingEnabled: boolean } | undefined,
) {
  if (
    !organization ||
    organization.status !== 'active' ||
    !organization.messagingEnabled
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Модуль сообщений недоступен',
      data: { code: 'MESSAGING_DISABLED' },
    })
  }
}

export async function requireMessagingActor(
  event: Parameters<typeof requireActor>[0],
) {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  await assertMessagingAccess(actor)
  return actor
}

export async function assertMessagingAccess(actor: Actor) {
  requireRole(actor, 'administrator')
  const [organization] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, actor.organizationId)))
  assertMessagingEnabled(organization)
}
