import { and, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { latestReleaseAnnouncement, hasSeenRelease } from '../../../shared/config/changelog'
import { releaseSeenSchema, type ReleaseAnnouncementState } from '../../../shared/contracts/release-announcements'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'

function ownAccount(actor: Actor) {
  // A user's viewing history belongs to their account, independently of support-client context.
  return and(eq(users.id, actor.id), eq(users.status, 'active'), actor.isSuperuser ? undefined : eq(users.organizationId, actor.organizationId))
}
export async function getReleaseAnnouncementState(actor: Actor): Promise<ReleaseAnnouncementState> {
  const release = latestReleaseAnnouncement()
  const [user] = await db.select({ lastSeen: users.lastSeenReleaseVersion }).from(users).where(ownAccount(actor))
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  return { version: release?.version ?? null, seen: !release || hasSeenRelease(user.lastSeen, release.version) }
}
export async function markReleaseAnnouncementSeen(actor: Actor, input: unknown): Promise<ReleaseAnnouncementState> {
  const { version } = releaseSeenSchema.parse(input)
  if (latestReleaseAnnouncement()?.version !== version) throw createError({ statusCode: 409, statusMessage: 'Версия обновления изменилась' })
  const [user] = await db.update(users).set({ lastSeenReleaseVersion: sql`greatest(coalesce(${users.lastSeenReleaseVersion}, ''), ${version})` }).where(ownAccount(actor)).returning({ version: users.lastSeenReleaseVersion })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  return { version, seen: true }
}
