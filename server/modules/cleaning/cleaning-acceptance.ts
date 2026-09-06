import { and, eq } from 'drizzle-orm'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { cleaningAssignments, cleanings } from '../../infrastructure/database/schema'

export function hasAcceptedCleaning(cleaning: { assignments: Array<{ acceptedAt: Date | string | null }> }) {
  return cleaning.assignments.some(assignment => Boolean(assignment.acceptedAt))
}

export async function requireAcceptedCleaningAssignment(actor: Actor, cleaningId: string) {
  if (actor.roles.includes('administrator')) return
  if (!actor.roles.includes('cleaner')) throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })

  const assignment = await db.select({ acceptedAt: cleaningAssignments.acceptedAt })
    .from(cleaningAssignments)
    .innerJoin(cleanings, eq(cleanings.id, cleaningAssignments.cleaningId))
    .where(and(
      eq(cleaningAssignments.cleaningId, cleaningId),
      eq(cleaningAssignments.cleanerId, actor.id),
      eq(cleanings.organizationId, actor.organizationId)
    ))
    .limit(1)

  if (!assignment.length) throw createError({ statusCode: 403, statusMessage: 'Уборка не назначена вам' })
  if (!assignment[0]?.acceptedAt) throw createError({ statusCode: 403, statusMessage: 'Сначала примите назначенную уборку' })
}
