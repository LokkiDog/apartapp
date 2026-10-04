import { and, eq } from 'drizzle-orm'
import { db } from '../database/client'
import { organizations, users } from '../database/schema'

export async function bootstrapAdministrator() {
  const config = useRuntimeConfig()
  const email = config.bootstrapAdminEmail?.trim().toLowerCase()
  const password = config.bootstrapAdminPassword
  if (!email || !password) { await promoteSuperuser(); return }
  const existingAccount = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existingAccount) { await promoteSuperuser(); return }
  const organizationName = config.organizationName || 'Aparts'
  const currentOrganization = await db.query.organizations.findFirst({ where: eq(organizations.name, organizationName) })
    ?? (await db.insert(organizations).values({ name: organizationName }).returning())[0]
  if (!currentOrganization) return
  const existing = await db.query.users.findFirst({ where: and(eq(users.organizationId, currentOrganization.id), eq(users.email, email)) })
  if (!existing) await db.insert(users).values({ organizationId: currentOrganization.id, email, name: 'Администратор', passwordHash: await hashPassword(password), roles: ['administrator'], status: 'active' })
  await promoteSuperuser()
}


export async function promoteSuperuser() {
  const email = (process.env.SUPERUSER_EMAIL || useRuntimeConfig().superuserEmail)?.trim().toLowerCase()
  if (!email) return
  const user = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!user || user.status !== 'active' || !user.roles.includes('administrator')) throw new Error('SUPERUSER_EMAIL must identify an existing active administrator')
  await db.update(users).set({ isSuperuser: true }).where(eq(users.id, user.id))
}
