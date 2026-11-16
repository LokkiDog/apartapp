import { and, eq, exists, isNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { Actor } from '../../infrastructure/auth/actor'
import { requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartmentPublications, apartments, attachments, organizations, publicSites, users } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { contactPhoneSchema, publicSiteInputSchema, publicSiteZone, websiteUrlSchema, type PublicSite, type PublicSiteSettings } from '../../../shared/contracts/public-site'

export async function getPublicSiteSettings(actor: Actor): Promise<PublicSiteSettings> {
  requireRole(actor, 'administrator')
  const [settings] = await db.select().from(publicSites).where(eq(publicSites.organizationId, actor.organizationId))
  const profiles = await db.select({ id: users.id, name: users.name, phone: users.phone, socials: users.socials, photoKey: users.profilePhotoKey }).from(users).where(and(eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))).orderBy(users.name)
  return {
    settings: settings ? {
      enabled: settings.enabled, websiteUrl: settings.websiteUrl ?? '', slug: settings.slug ?? '',
      title: settings.title, description: settings.description, accent: settings.accent,
      hostUserId: settings.hostUserId, hostDescription: settings.hostDescription, contactKinds: settings.contactKinds
    } : publicSiteInputSchema.parse({ enabled: false, hostUserId: null }),
    addressLocked: Boolean(settings?.addressLocked),
    profiles: profiles.map(({ photoKey, ...profile }) => ({ ...profile, hasPhoto: Boolean(photoKey) }))
  }
}

export async function savePublicSiteSettings(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const parsed = publicSiteInputSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid site settings' })
  const { websiteUrl: submittedUrl, slug, ...data } = parsed.data
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`public-site:${actor.organizationId}`}))`)
      const [current] = await tx.select().from(publicSites).where(eq(publicSites.organizationId, actor.organizationId))
      const legacyUrl = current?.slug ? null : current?.websiteUrl
      if (!legacyUrl && process.env.CRM_BRAND !== 'magicmop') {
        throw createError({ statusCode: 404 })
      }
      if ((legacyUrl && slug) || (current?.addressLocked && slug !== current.slug)) {
        throw createError({ statusCode: 409, data: { code: 'SITE_ADDRESS_LOCKED' } })
      }
      const [host] = data.hostUserId ? await tx.select({ socials: users.socials }).from(users)
        .where(and(eq(users.id, data.hostUserId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')))
        .for('share') : []
      if (data.hostUserId && !host && (data.enabled || data.hostUserId !== current?.hostUserId)) {
        throw createError({ statusCode: 400, data: { code: 'SITE_PROFILE_REQUIRED' } })
      }
      const websiteUrl = legacyUrl ?? (slug ? `https://${slug}.${publicSiteZone}` : null)
      if (submittedUrl && submittedUrl !== websiteUrl && submittedUrl !== current?.websiteUrl && !slug) {
        throw createError({ statusCode: 409, data: { code: 'SITE_ADDRESS_UNAVAILABLE' } })
      }
      if (data.enabled && !legacyUrl) {
        if (!slug || !data.title) throw createError({ statusCode: 400, data: { code: 'SITE_DETAILS_REQUIRED' } })
        const whatsapp = host?.socials.find(contact => contact.platform === 'whatsapp')?.value
        if (!whatsapp || !data.contactKinds.includes('whatsapp') || !contactPhoneSchema.safeParse(whatsapp).success) {
          throw createError({ statusCode: 400, data: { code: 'SITE_WHATSAPP_REQUIRED' } })
        }
        const [published] = await tx.select({ id: apartments.id }).from(apartmentPublications)
          .innerJoin(apartments, and(eq(apartments.id, apartmentPublications.apartmentId), eq(apartments.organizationId, actor.organizationId)))
          .where(and(
            eq(apartmentPublications.organizationId, actor.organizationId),
            eq(apartmentPublications.published, true),
            eq(apartments.status, 'active'),
            exists(tx.select({ id: attachments.id }).from(attachments).where(and(
              eq(attachments.organizationId, actor.organizationId),
              eq(attachments.entityType, 'apartment'),
              eq(attachments.entityId, apartments.id)
            )))
          )).limit(1)
        if (!published) {
          throw createError({ statusCode: 400, data: { code: 'SITE_APARTMENT_REQUIRED' } })
        }
      }
      const values = { ...data, websiteUrl, slug: slug || null, addressLocked: Boolean(current?.addressLocked || (slug && data.enabled)) }
      await tx.insert(publicSites).values({ ...values, organizationId: actor.organizationId })
        .onConflictDoUpdate({ target: publicSites.organizationId, set: { ...values, updatedAt: new Date() } })
    })
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') throw createError({ statusCode: 409, data: { code: 'SITE_ADDRESS_UNAVAILABLE' } })
    throw error
  }
  return getPublicSiteSettings(actor)
}
export async function resolvePublicSite(origin: unknown) {
  const parsed = websiteUrlSchema.safeParse(origin)
  if (!parsed.success) throw createError({ statusCode: 404, statusMessage: 'Сайт не настроен' })
  const [row] = await db.select({ organizationId: publicSites.organizationId, slug: publicSites.slug, title: publicSites.title, description: publicSites.description, accent: publicSites.accent, hostDescription: publicSites.hostDescription, contactKinds: publicSites.contactKinds, host: { name: users.name, phone: users.phone, socials: users.socials, profilePhotoKey: users.profilePhotoKey, updatedAt: users.updatedAt } }).from(publicSites)
    .innerJoin(organizations, and(eq(organizations.id, publicSites.organizationId), eq(organizations.status, 'active')))
    .innerJoin(users, and(eq(users.id, publicSites.hostUserId), eq(users.organizationId, publicSites.organizationId), eq(users.status, 'active')))
    .where(and(
      eq(publicSites.websiteUrl, parsed.data),
      eq(publicSites.enabled, true),
      process.env.CRM_BRAND === 'magicmop' ? undefined : isNull(publicSites.slug)
    ))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Сайт не настроен' })
  return { ...row, websiteUrl: parsed.data }
}
export async function publicSiteInfo(origin: unknown): Promise<PublicSite> {
  const { websiteUrl, host, hostDescription, contactKinds, slug, title, description, accent } = await resolvePublicSite(origin)
  const socials = host.socials.filter(channel => contactKinds.includes(channel.platform))
  return { websiteUrl, ...(slug ? { branding: { title, description, accent } } : {}), hostName: host.name, whatsapp: socials.find(channel => channel.platform === 'whatsapp')?.value ?? '',
    phone: contactKinds.includes('phone') ? host.phone : '', socials: socials.filter(channel => channel.platform !== 'whatsapp'), hostDescription, hostPhoto: host.profilePhotoKey ? `/api/catalogue/host-photo?v=${encodeURIComponent(host.updatedAt.toISOString())}` : '' }
}
export async function publicHostPhoto(origin: unknown) {
  const { host } = await resolvePublicSite(origin)
  if (!host.profilePhotoKey) throw createError({ statusCode: 404 })
  try { return await fileStorage.get(host.profilePhotoKey) }
  catch (error: any) { if (error?.code === 'ENOENT') throw createError({ statusCode: 404 }); throw error }
}
