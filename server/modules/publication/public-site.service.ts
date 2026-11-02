import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { Actor } from '../../infrastructure/auth/actor'
import { requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { organizations, publicSites, users } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { contactPhoneSchema, publicSiteInputSchema, websiteUrlSchema, type PublicSite, type PublicSiteSettings } from '../../../shared/contracts/public-site'

export async function getPublicSiteSettings(actor: Actor): Promise<PublicSiteSettings> {
  requireRole(actor, 'administrator')
  const [settings] = await db.select().from(publicSites).where(eq(publicSites.organizationId, actor.organizationId))
  const profiles = await db.select({ id: users.id, name: users.name, phone: users.phone, photoKey: users.profilePhotoKey }).from(users).where(and(eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))).orderBy(users.name)
  return { settings: settings ? { enabled: settings.enabled, websiteUrl: settings.websiteUrl, hostUserId: settings.hostUserId } : { enabled: false, websiteUrl: '', hostUserId: null }, profiles: profiles.map(({ photoKey, ...profile }) => ({ ...profile, hasPhoto: Boolean(photoKey) })) }
}
export async function savePublicSiteSettings(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = publicSiteInputSchema.parse(input)
  try {
    await db.transaction(async tx => {
      if (data.hostUserId) {
        const [host] = await tx.select({ phone: users.phone }).from(users).where(and(eq(users.id, data.hostUserId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))).for('share')
        if (!host) throw createError({ statusCode: 400, statusMessage: 'Профиль недоступен' })
        if (data.enabled && (!host.phone || !contactPhoneSchema.safeParse(host.phone).success)) throw createError({ statusCode: 400, statusMessage: 'Добавьте телефон в профиль' })
      }
      await tx.insert(publicSites).values({ ...data, organizationId: actor.organizationId }).onConflictDoUpdate({ target: publicSites.organizationId, set: { ...data, updatedAt: new Date() } })
    })
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Адрес сайта уже используется' })
    throw error
  }
  return getPublicSiteSettings(actor)
}
export async function resolvePublicSite(origin: unknown) {
  const parsed = websiteUrlSchema.safeParse(origin)
  if (!parsed.success) throw createError({ statusCode: 404, statusMessage: 'Сайт не настроен' })
  const [row] = await db.select({ organizationId: publicSites.organizationId, websiteUrl: publicSites.websiteUrl, host: { name: users.name, phone: users.phone, publicBio: users.publicBio, profilePhotoKey: users.profilePhotoKey, updatedAt: users.updatedAt } }).from(publicSites)
    .innerJoin(organizations, and(eq(organizations.id, publicSites.organizationId), eq(organizations.status, 'active')))
    .innerJoin(users, and(eq(users.id, publicSites.hostUserId), eq(users.organizationId, publicSites.organizationId), eq(users.status, 'active')))
    .where(and(eq(publicSites.websiteUrl, parsed.data), eq(publicSites.enabled, true)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Сайт не настроен' })
  return row
}
export async function publicSiteInfo(origin: unknown): Promise<PublicSite> {
  const { websiteUrl, host } = await resolvePublicSite(origin)
  return { websiteUrl, hostName: host.name, whatsapp: host.phone, hostDescription: host.publicBio, hostPhoto: host.profilePhotoKey ? `/api/catalogue/host-photo?v=${encodeURIComponent(host.updatedAt.toISOString())}` : '' }
}
export async function publicHostPhoto(origin: unknown) {
  const { host } = await resolvePublicSite(origin)
  if (!host.profilePhotoKey) throw createError({ statusCode: 404 })
  try { return await fileStorage.get(host.profilePhotoKey) }
  catch (error: any) { if (error?.code === 'ENOENT') throw createError({ statusCode: 404 }); throw error }
}
