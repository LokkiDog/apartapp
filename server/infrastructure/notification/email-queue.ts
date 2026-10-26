import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { effectiveNotificationChannels } from '@contracts/notification-preferences'
import { db } from '../database/client'
import { notificationEmailQueue, notificationPreferences, notifications, users, organizations } from '../database/schema'
import { sendNotificationEmail } from '../mail/send'
import { localizedNotificationBody, localizedNotificationTitle } from './localize'

const retryDelays = [60_000, 300_000, 1_800_000, 3_600_000]
export async function processNotificationEmails() {
  const jobs = await db.transaction(async tx => {
    const available = await tx.select().from(notificationEmailQueue).where(and(
      eq(notificationEmailQueue.status, 'pending'), lte(notificationEmailQueue.availableAt, new Date()),
      or(isNull(notificationEmailQueue.leaseUntil), lte(notificationEmailQueue.leaseUntil, new Date()))
    )).orderBy(notificationEmailQueue.availableAt).limit(10).for('update', { skipLocked: true })
    const claimed = []
    for (const job of available) {
      if (job.attempts >= 5) {
        await tx.update(notificationEmailQueue).set({ status: 'failed', leaseUntil: null, leaseToken: null }).where(eq(notificationEmailQueue.id, job.id))
        continue
      }
      const [next] = await tx.update(notificationEmailQueue).set({ attempts: job.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 10 * 60_000) }).where(eq(notificationEmailQueue.id, job.id)).returning()
      if (next) claimed.push(next)
    }
    return claimed
  })
  await Promise.all(jobs.map(async job => {
    const owned = and(eq(notificationEmailQueue.id, job.id), eq(notificationEmailQueue.leaseToken, job.leaseToken!))
    try {
      const [record] = await db.select({ notification: notifications, user: users, organization: organizations }).from(notifications)
        .innerJoin(users, eq(users.id, notifications.userId)).innerJoin(organizations, eq(organizations.id, notifications.organizationId))
        .where(eq(notifications.id, job.notificationId))
      if (!record) {
        await db.update(notificationEmailQueue).set({ status: 'skipped', leaseUntil: null, leaseToken: null }).where(owned)
        return
      }
      const { notification, user, organization } = record
      const [preference] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.organizationId, notification.organizationId), eq(notificationPreferences.userId, user.id), eq(notificationPreferences.eventKey, notification.eventKey ?? '')))
      if (user.status !== 'active' || user.organizationId !== organization.id || organization.status !== 'active' || !effectiveNotificationChannels(preference).email) {
        await db.update(notificationEmailQueue).set({ status: 'skipped', leaseUntil: null, leaseToken: null }).where(owned)
        return
      }
      const title = localizedNotificationTitle(notification.type, user.locale, notification.title, notification.eventKey)
      const body = localizedNotificationBody(notification.type, user.locale, notification.body)
      const href = notification.href ?? (notification.crmVisible ? '/notifications' : null)
      const base = new URL(useRuntimeConfig().public.appUrl)
      const url = href ? new URL(href, base) : null
      const link = url?.origin === base.origin ? url.href : null
      await sendNotificationEmail({ to: user.email, name: user.name, subject: title, text: [title, body, link].filter(Boolean).join('\n\n') })
      await db.update(notificationEmailQueue).set({ status: 'sent', leaseUntil: null, leaseToken: null, lastError: null }).where(owned)
    } catch {
      // SMTP is at-least-once: a crash after delivery may cause a retry. The lease prevents concurrent sends.
      await db.update(notificationEmailQueue).set({ status: job.attempts >= 5 ? 'failed' : 'pending', leaseUntil: null, leaseToken: null, lastError: 'delivery_failed', availableAt: new Date(Date.now() + (retryDelays[job.attempts - 1] ?? 3_600_000)) }).where(owned)
    }
  }))
  return jobs.length
}
