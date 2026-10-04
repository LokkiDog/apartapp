import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { organizations, platformAuditLogs, platformSessions, systemSettings, users } from '../../infrastructure/database/schema'
import { createInvitation, deliverInvitation, resendInvitation } from '../auth/account.service'
import type { Actor } from '../../infrastructure/auth/actor'
import { sessionExpiry } from '../../infrastructure/auth/platform'
import { publishNotification } from '../../infrastructure/notification/realtime'
import type { z } from 'zod'
import type { clientInputSchema, clientUpdateSchema, administratorInputSchema, RegistrationMode } from '../../../shared/contracts/platform'

function assertSuperuser(actor: Actor) {
  if (!actor.isSuperuser) throw createError({ statusCode: 403, statusMessage: 'Требуется суперпользователь' })
}

async function findClient(id: string) {
  const client = await db.query.organizations.findFirst({ where: eq(organizations.id, id) })
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Клиент не найден' })
  return client
}
export async function listClients(actor: Actor) {
  assertSuperuser(actor)
  const clients = await db.query.organizations.findMany({ orderBy: [desc(organizations.createdAt)] })
  const members = await db.query.users.findMany({ columns: { id: true, organizationId: true, name: true, email: true, status: true, roles: true, isSuperuser: true }, orderBy: [users.createdAt] })
  return clients.map(client => ({ ...client, administrators: members.filter(user => user.organizationId === client.id && user.roles.includes('administrator')).map(({ roles, organizationId, ...user }) => user) }))
}
export async function createClient(actor: Actor, input: z.infer<typeof clientInputSchema>) {
  assertSuperuser(actor)
  const result = await db.transaction(async tx => {
    const [client] = await tx.insert(organizations).values({ name: input.name, timezone: input.timezone }).returning()
    if (!client) throw new Error('Client creation failed')
    const invitation = await createInvitation(tx, { organizationId: client.id, name: input.administratorName, email: input.email, roles: ['administrator'] })
    await tx.insert(platformAuditLogs).values({ actorId: actor.id, organizationId: client.id, action: 'client.created' })
    return { client, invitation }
  })
  let invitationSent = true
  try { await deliverInvitation(result.invitation) } catch { invitationSent = false }
  return { ...result.client, invitationSent }
}
export async function updateClient(actor: Actor, id: string, input: z.infer<typeof clientUpdateSchema>) {
  assertSuperuser(actor)
  const updated = await db.transaction(async tx => {
    const [previous] = await tx.select().from(organizations).where(eq(organizations.id, id)).for('update')
    if (!previous) throw createError({ statusCode: 404, statusMessage: 'Клиент не найден' })
    const [updated] = await tx.update(organizations).set({ ...input, updatedAt: new Date() }).where(eq(organizations.id, id)).returning()
    await tx.insert(platformAuditLogs).values({ actorId: actor.id, organizationId: id, action: input.status && previous.status !== input.status ? `client.${input.status === 'blocked' ? 'blocked' : 'unblocked'}` : 'client.updated', payload: { before: previous, after: input } })
    return updated
  })
  if (input.status === 'blocked') {
    const members = await db.query.users.findMany({ where: and(eq(users.organizationId, id), eq(users.isSuperuser, false)), columns: { id: true } })
    for (const member of members) publishNotification(member.id, { type: 'session.revoked', reason: 'blocked' })
  }
  return updated
}
export async function inviteClientAdministrator(actor: Actor, id: string, input: z.infer<typeof administratorInputSchema>) {
  assertSuperuser(actor)
  await findClient(id)
  const invitation = await db.transaction(async tx => {
    const invitation = await createInvitation(tx, { organizationId: id, name: input.name, email: input.email, roles: ['administrator'] })
    await tx.insert(platformAuditLogs).values({ actorId: actor.id, organizationId: id, action: 'client.administrator_invited', payload: { userId: invitation.user.id } })
    return invitation
  })
  let invitationSent = true
  try { await deliverInvitation(invitation) } catch { invitationSent = false }
  return { id: invitation.user.id, invitationSent }
}
export async function resendClientInvitation(actor: Actor, id: string, userId: string) {
  assertSuperuser(actor)
  await findClient(id)
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.organizationId, id)) })
  if (!user?.roles.includes('administrator')) throw createError({ statusCode: 404, statusMessage: 'Администратор не найден' })
  const result = await resendInvitation({ ...actor, organizationId: id, roles: ['administrator'] }, userId)
  await db.insert(platformAuditLogs).values({ actorId: actor.id, organizationId: id, action: 'client.invitation_resent', payload: { userId } })
  return result
}
export async function setRegistrationMode(actor: Actor, mode: RegistrationMode) {
  assertSuperuser(actor)
  await db.transaction(async tx => {
    await tx.update(systemSettings).set({ registrationMode: mode, updatedAt: new Date() }).where(eq(systemSettings.id, 'platform'))
    await tx.insert(platformAuditLogs).values({ actorId: actor.id, action: 'registration.mode_changed', payload: { mode } })
  })
  return { registrationMode: mode }
}
export async function selectClient(actor: Actor, organizationId: string | null) {
  assertSuperuser(actor)
  if (organizationId) await findClient(organizationId)
  await db.transaction(async tx => {
    const [updated] = await tx.update(platformSessions).set({ organizationId, revision: randomUUID(), expiresAt: sessionExpiry() })
      .where(and(eq(platformSessions.id, actor.platformSessionId!), eq(platformSessions.userId, actor.id))).returning()
    if (!updated) throw createError({ statusCode: 401, statusMessage: 'Сессия недействительна' })
    await tx.insert(platformAuditLogs).values({ actorId: actor.id, organizationId, action: organizationId ? 'client.entered' : 'client.left', payload: { previousOrganizationId: actor.inSystem ? null : actor.organizationId } })
  })
  return { ok: true }
}
