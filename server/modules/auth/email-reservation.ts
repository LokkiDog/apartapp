import { eq, sql } from 'drizzle-orm'
import { users, pendingRegistrations } from '../../infrastructure/database/schema'
import type { db } from '../../infrastructure/database/client'
export type Connection = Parameters<Parameters<typeof db.transaction>[0]>[0]
export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export async function lockEmail(tx: Connection, email: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email:${normalizeEmail(email)}`}))`)
}
export async function ensureEmailAvailable(tx: Connection, email: string, allowPending = false) {
  if (await tx.query.users.findFirst({ where: eq(users.email, email) })) throw createError({ statusCode: 409, statusMessage: 'Email уже используется' })
  if (!allowPending) {
    const pending = await tx.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) })
    if (pending && pending.expiresAt > new Date()) throw createError({ statusCode: 409, statusMessage: 'Email ожидает подтверждения' })
    if (pending) await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.id, pending.id))
  }
}
