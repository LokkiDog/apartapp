import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createError, createEvent, defineEventHandler, getRouterParam, setHeader, getResponseHeader, readMultipartFormData, getQuery } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq, sql } from 'drizzle-orm'
import * as schema from '../server/infrastructure/database/schema'
import type { Actor } from '../server/infrastructure/auth/actor'

const url = process.env.PUBLICATION_TEST_DATABASE_URL
let db: typeof import('../server/infrastructure/database/client').db
let connection: typeof import('../server/infrastructure/database/client').sql
let service: typeof import('../server/modules/publication/publication.service')
let actor: Actor
let hotelId: string
let apartmentId: string
let photoId: string
let foreignPhotoId: string
let foreignOrganization: string
let draft: Record<string, unknown>
let storageRoot: string
describe.skipIf(!url)('guest publications PostgreSQL', () => {
  beforeAll(async () => {
    if (new URL(url!).pathname !== '/aparts_publication_579e_test') throw new Error('Use only the disposable aparts_publication_579e_test database')
    process.env.DATABASE_URL = url
    storageRoot = await mkdtemp(join(tmpdir(), 'aparts-publication-'))
    process.env.FILE_STORAGE_PATH = storageRoot
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('getRouterParam', getRouterParam)
    vi.stubGlobal('getQuery', getQuery)
    vi.stubGlobal('setHeader', setHeader)
    const database = await import('../server/infrastructure/database/client')
    db = database.db; connection = database.sql
    await db.execute(sql`SET client_min_messages TO WARNING`)
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql`CREATE SCHEMA public`)
    await migrate(db, { migrationsFolder: 'server/infrastructure/database/migrations' })
    service = await import('../server/modules/publication/publication.service')
    const [org] = await db.insert(schema.organizations).values({ name: 'Guest test' }).returning()
    const [foreign] = await db.insert(schema.organizations).values({ name: 'Other organization' }).returning()
    foreignOrganization = foreign!.id
    const [user] = await db.insert(schema.users).values({ organizationId: org!.id, email: 'publication@example.test', name: 'Admin', phone: '+359888123456', status: 'active', passwordHash: 'test-only', roles: ['administrator'] }).returning()
    const [foreignUser] = await db.insert(schema.users).values({ organizationId: foreign!.id, email: 'foreign-publication@example.test', name: 'Foreign admin', passwordHash: 'test-only', roles: ['administrator'] }).returning()
    await db.insert(schema.publicSites).values({ organizationId: org!.id, websiteUrl: 'https://public.example.test', enabled: true, hostUserId: user!.id })
    actor = { id: user!.id, organizationId: org!.id, email: user!.email, name: user!.name, roles: ['administrator'], locale: 'ru' }
    const [hotel] = await db.insert(schema.hotels).values({ organizationId: org!.id, name: 'Hotel', address: 'Bansko', latitude: '41.84', longitude: '23.48' }).returning()
    hotelId = hotel!.id
    const [type] = await db.insert(schema.apartmentTypes).values({ organizationId: org!.id, name: 'Studio', ownerTotalEur: 0, cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0 }).returning()
    const [apartment] = await db.insert(schema.apartments).values({ organizationId: org!.id, hotelId: hotel!.id, apartmentTypeId: type!.id, name: 'INTERNAL apartment', instructions: 'SECRET ENTRY CODE', capacity: 4, rooms: 2, checkInTime: '15:00', checkOutTime: '11:00' }).returning()
    apartmentId = apartment!.id
    const [photo, foreignPhoto] = await db.insert(schema.attachments).values([{ organizationId: org!.id, entityType: 'apartment', entityId: apartmentId, fileName: 'internal-name.jpg', mimeType: 'image/jpeg', storageKey: 'private/storage-key', uploadedById: user!.id }, { organizationId: foreign!.id, entityType: 'apartment', entityId: apartmentId, fileName: 'foreign.jpg', mimeType: 'image/jpeg', storageKey: 'foreign', uploadedById: foreignUser!.id }]).returning()
    photoId = photo!.id; foreignPhotoId = foreignPhoto!.id
    draft = { published: false, slug: 'studio', sortOrder: 0, translations: { ru: { title: 'Студия', summary: 'Для отдыха', description: 'Кухня и балкон.', location: '' } }, amenities: ['wifi'], photoIds: [photoId] }
  }, 30000)
  afterAll(async () => { await connection?.end(); if (storageRoot) await rm(storageRoot, { recursive: true, force: true }); vi.unstubAllGlobals() })
  it('publishes only the selected own profile, follows edits and revokes public data and photos', async () => {
    const sites = await import('../server/modules/publication/public-site.service')
    const profiles = await import('../server/modules/auth/profile.service')
    const { fileStorage } = await import('../server/infrastructure/storage/local')
    const original = (await sites.getPublicSiteSettings(actor)).settings
    const [foreign] = await db.select().from(schema.users).where(eq(schema.users.organizationId, foreignOrganization))
    await expect(sites.getPublicSiteSettings({ ...actor, roles: ['manager'] })).rejects.toMatchObject({ statusCode: 403 })
    await expect(sites.savePublicSiteSettings(actor, { ...original, hostUserId: foreign!.id })).rejects.toMatchObject({ statusCode: 400 })
    await expect(sites.savePublicSiteSettings({ ...actor, organizationId: foreignOrganization }, { ...original, hostUserId: foreign!.id })).rejects.toMatchObject({ statusCode: 400 })
    await expect(sites.resolvePublicSite('https://unknown.example.test')).rejects.toMatchObject({ statusCode: 404 })
    expect((await sites.getPublicSiteSettings(actor)).profiles.map(profile => profile.id)).not.toContain(foreign!.id)
    await db.update(schema.users).set({ status: 'active', phone: '+359888999888' }).where(eq(schema.users.id, foreign!.id))
    await expect(sites.savePublicSiteSettings({ ...actor, organizationId: foreignOrganization }, { ...original, hostUserId: foreign!.id })).rejects.toMatchObject({ statusCode: 409 })
    expect((await sites.getPublicSiteSettings(actor)).settings).toEqual(original)
    try {
      await profiles.updateOwnProfile(actor, { name: 'Victoria', phone: '+359 888 222 333', publicBio: { ru: 'На связи', en: 'Here to help', he: '', bg: '' } })
      const info = await sites.publicSiteInfo('https://public.example.test/')
      expect(info).toEqual({ websiteUrl: 'https://public.example.test', hostName: 'Victoria', whatsapp: '+359 888 222 333', hostPhoto: '', hostDescription: { ru: 'На связи', en: 'Here to help', he: '', bg: '' } })
      const image = await sharp({ create: { width: 8, height: 12, channels: 3, background: '#c0ffee' } }).jpeg().withMetadata().toBuffer()
      await expect(profiles.setOwnProfilePhoto({ ...actor, organizationId: foreignOrganization }, { data: image, type: 'image/jpeg' })).rejects.toMatchObject({ statusCode: 404 })
      await expect(profiles.setOwnProfilePhoto(actor, { data: Buffer.from('invalid'), type: 'image/jpeg' })).rejects.toMatchObject({ statusCode: 400 })
      const updated = await profiles.setOwnProfilePhoto(actor, { data: image, type: 'image/jpeg' })
      expect(updated.hasPhoto).toBe(true)
      const first = await db.query.users.findFirst({ where: eq(schema.users.id, actor.id) })
      expect((await sites.publicSiteInfo('https://public.example.test')).hostPhoto).toMatch(/^\/api\/catalogue\/host-photo\?v=/)
      const publicImage = await sites.publicHostPhoto('https://public.example.test')
      expect(await sharp(publicImage).metadata()).toMatchObject({ format: 'webp', width: 8, height: 12 })
      expect((await sharp(publicImage).metadata()).exif).toBeUndefined()
      await profiles.setOwnProfilePhoto(actor, { data: image, type: 'image/jpeg' })
      await expect(fileStorage.get(first!.profilePhotoKey!)).rejects.toMatchObject({ code: 'ENOENT' })
      await sites.savePublicSiteSettings(actor, { ...original, enabled: false })
      await expect(sites.publicSiteInfo('https://public.example.test')).rejects.toMatchObject({ statusCode: 404 })
      await expect(sites.publicHostPhoto('https://public.example.test')).rejects.toMatchObject({ statusCode: 404 })
      await sites.savePublicSiteSettings(actor, original)
      await db.update(schema.organizations).set({ status: 'blocked' }).where(eq(schema.organizations.id, actor.organizationId))
      await expect(sites.publicSiteInfo('https://public.example.test')).rejects.toMatchObject({ statusCode: 404 })
      await db.update(schema.organizations).set({ status: 'active' }).where(eq(schema.organizations.id, actor.organizationId))
      await db.update(schema.users).set({ status: 'archived' }).where(eq(schema.users.id, actor.id))
      await expect(sites.publicHostPhoto('https://public.example.test')).rejects.toMatchObject({ statusCode: 404 })
      await db.update(schema.users).set({ status: 'active' }).where(eq(schema.users.id, actor.id))
      expect((await profiles.setOwnProfilePhoto(actor, null)).hasPhoto).toBe(false)
      await expect(sites.publicHostPhoto('https://public.example.test')).rejects.toMatchObject({ statusCode: 404 })
    } finally {
      await db.update(schema.organizations).set({ status: 'active' }).where(eq(schema.organizations.id, actor.organizationId))
      await db.update(schema.users).set({ status: 'active', name: 'Admin', phone: '+359888123456' }).where(eq(schema.users.id, actor.id))
      await profiles.setOwnProfilePhoto(actor, null)
      await sites.savePublicSiteSettings(actor, original)
    }
  })
  it('suggests Latin apartment addresses and resolves simultaneous duplicate defaults with the hotel and a suffix', async () => {
    const original = await db.query.apartments.findFirst({ where: eq(schema.apartments.id, apartmentId) })
    const [hotel] = await db.insert(schema.hotels).values({ organizationId: actor.organizationId, name: 'Снежный дом', address: 'Bansko', latitude: '41.84', longitude: '23.48' }).returning()
    const created = await db.insert(schema.apartments).values(Array.from({ length: 3 }, () => ({ organizationId: actor.organizationId, hotelId: hotel!.id, apartmentTypeId: original!.apartmentTypeId, name: 'Вид на горы', capacity: 2, rooms: 1, checkInTime: '15:00', checkOutTime: '11:00' }))).returning()
    try {
      const defaults = await Promise.all(created.map(apartment => service.getPublication(actor, apartment.id)))
      expect(defaults.map(value => value.slug)).toEqual(['snezhnyy-dom-vid-na-gory', 'snezhnyy-dom-vid-na-gory', 'snezhnyy-dom-vid-na-gory'])
      expect(defaults.map(value => value.translations.ru.title)).toEqual(['Вид на горы', 'Вид на горы', 'Вид на горы'])
      const saved = await Promise.all(created.map((apartment, index) => service.savePublication(actor, apartment.id, defaults[index])))
      expect(saved.map(value => value.slug).sort()).toEqual(['snezhnyy-dom-vid-na-gory', 'snezhnyy-dom-vid-na-gory-2', 'snezhnyy-dom-vid-na-gory-3'])
      const customized = { ...saved[1]!, translations: { ru: { ...saved[1]!.translations.ru, title: 'Название для гостей' } } }
      await service.savePublication(actor, created[1]!.id, customized)
      expect((await service.getPublication(actor, created[1]!.id)).translations.ru.title).toBe('Название для гостей')
      await service.savePublication(actor, created[2]!.id, { ...saved[2]!, translations: { ru: { ...saved[2]!.translations.ru, title: '   ' } } })
      expect((await service.getPublication(actor, created[2]!.id)).translations.ru.title).toBe('Вид на горы')
      // Renaming an apartment does not rewrite an already saved address.
      await db.update(schema.apartments).set({ name: 'Другое название' }).where(eq(schema.apartments.id, created[0]!.id))
      expect((await service.getPublication(actor, created[0]!.id)).slug).toBe(saved[0]!.slug)
      expect((await service.getPublication(actor, created[0]!.id)).translations.ru.title).toBe('Вид на горы')
      await db.update(schema.apartmentPublications).set({ slug: 'drugoe-nazvanie' }).where(eq(schema.apartmentPublications.apartmentId, created[0]!.id))
      expect((await service.getPublication(actor, created[0]!.id)).slug).toBe('snezhnyy-dom-drugoe-nazvanie')
      // Upgrade only the former autogenerated draft address, preserving its other fields.
      await db.update(schema.apartmentPublications).set({ slug: `apartment-${created[0]!.id}` }).where(eq(schema.apartmentPublications.apartmentId, created[0]!.id))
      expect((await service.getPublication(actor, created[0]!.id)).slug).toBe('snezhnyy-dom-drugoe-nazvanie')
      await db.insert(schema.attachments).values({ organizationId: actor.organizationId, entityType: 'apartment', entityId: created[0]!.id, fileName: 'cover.jpg', mimeType: 'image/jpeg', storageKey: `slug-cover-${created[0]!.id}`, uploadedById: actor.id })
      await db.update(schema.apartmentPublications).set({ published: true, translations: { ru: { title: 'Вид на горы', summary: 'Для отдыха', description: 'Уютная квартира.', location: '' } } }).where(eq(schema.apartmentPublications.apartmentId, created[0]!.id))
      expect((await service.getPublication(actor, created[0]!.id)).slug).toBe(`apartment-${created[0]!.id}`)
    } finally {
      for (const apartment of created) {
        await db.delete(schema.attachments).where(eq(schema.attachments.entityId, apartment.id))
        await db.delete(schema.apartments).where(eq(schema.apartments.id, apartment.id))
      }
      await db.delete(schema.hotels).where(eq(schema.hotels.id, hotel!.id))
    }
  })
  it('enforces administrative and organization boundaries before reading or writing', async () => {
    await expect(service.getPublication({ ...actor, roles: ['manager'] }, apartmentId)).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.savePublication({ ...actor, roles: ['cleaner'] }, apartmentId, draft)).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.savePublication({ ...actor, organizationId: foreignOrganization }, apartmentId, draft)).rejects.toMatchObject({ statusCode: 404 })
    await expect(service.savePublication(actor, apartmentId, { ...draft, photoIds: [foreignPhotoId] })).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects translation requests outside the administrative apartment scope before contacting Google', async () => {
    const auth = await import('../server/infrastructure/auth/actor')
    const authMock = vi.spyOn(auth, 'requireActor')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const handler = (await import('../server/api/apartments/[id]/publication/translate.post')).default
    try {
      for (const [candidate, expected] of [[{ ...actor, roles: ['manager'] }, 403], [{ ...actor, organizationId: foreignOrganization }, 404]] as const) {
        authMock.mockResolvedValue(candidate as Actor)
        const req = new IncomingMessage(new Socket()); req.url = '/translate'; req.method = 'POST'
        const event = createEvent(req, new ServerResponse(req)); event.context.params = { id: apartmentId }
        await expect(handler(event)).rejects.toMatchObject({ statusCode: expected })
      }
      expect(fetchMock).not.toHaveBeenCalled()
    } finally { authMock.mockRestore(); fetchMock.mockRestore() }
  })
  it('keeps drafts private, publishes only guest fields and revokes visibility', async () => {
    const { listApartments } = await import('../server/modules/apartment/apartment.service')
    await service.savePublication(actor, apartmentId, draft)
    expect(await service.publicCatalogue(actor.organizationId)).toEqual([])
    expect((await listApartments(actor)).find(item => item.id === apartmentId)?.isPublished).toBe(false)
    await service.savePublication(actor, apartmentId, { ...draft, published: true })
    const result = await service.publicCatalogue(actor.organizationId)
    expect((await listApartments(actor)).find(item => item.id === apartmentId)?.isPublished).toBe(true)
    expect(result).toEqual([{ slug: 'studio', title: 'Студия', summary: 'Для отдыха', description: 'Кухня и балкон.', location: '', hotel: { id: hotelId, name: 'Hotel' }, mapLocation: { hotelId, hotelName: 'Hotel', latitude: 41.84, longitude: 23.48 }, capacity: 4, rooms: 2, checkInTime: '15:00', checkOutTime: '11:00', amenities: ['wifi'], photos: [{ id: photoId, url: `/api/catalogue/apartments/studio/photos/${photoId}` }] }])
    expect(await service.publicCatalogue(foreignOrganization)).toEqual([])
    const translations = {
      ru: { title: 'Студия', summary: 'Для отдыха', description: 'Кухня и балкон.', location: '' },
      en: { title: 'Mountain studio', summary: 'For your holiday', description: 'Kitchen and balcony.', location: '' },
      he: { title: 'סטודיו בהרים', summary: '', description: '', location: '' },
      bg: { title: 'Студио в планината', summary: '', description: '', location: '' },
    }
    await service.savePublication(actor, apartmentId, { ...draft, published: true, translations, amenities: ['wifi', 'dishwasher', 'crib', 'smoke_alarm'] })
    expect((await service.getPublication(actor, apartmentId)).amenities).toEqual(['wifi', 'dishwasher', 'crib', 'smoke_alarm'])
    expect((await service.publicCatalogue(actor.organizationId))[0]?.amenities).toEqual(['wifi', 'dishwasher', 'crib', 'smoke_alarm'])
    expect((await service.getPublication(actor, apartmentId)).translations).toEqual(translations)
    expect((await service.publicCatalogue(actor.organizationId, 'studio', 'en'))[0]).toMatchObject(translations.en)
    expect((await service.publicCatalogue(actor.organizationId, 'studio', 'he'))[0]).toMatchObject({ title: 'סטודיו בהרים', summary: 'Для отдыха', description: 'Кухня и балкон.' })
    expect((await service.publicCatalogue(actor.organizationId, 'studio', 'fr'))[0]?.title).toBe('Студия')

    await service.savePublication(actor, apartmentId, { ...draft, published: false })
    expect(await service.publicCatalogue(actor.organizationId, 'studio')).toEqual([])
    expect((await listApartments(actor)).find(item => item.id === apartmentId)?.isPublished).toBe(false)
  })
  it('never exposes coordinates or hotel names from another organization', async () => {
    await service.savePublication(actor, apartmentId, { ...draft, published: true })
    const [foreignHotel] = await db.insert(schema.hotels).values({ organizationId: foreignOrganization, name: 'Private foreign hotel', address: 'Private address', latitude: '42.1', longitude: '24.2' }).returning()
    try {
      await expect(db.update(schema.apartments).set({ hotelId: foreignHotel!.id }).where(eq(schema.apartments.id, apartmentId))).rejects.toThrow()
      const result = await service.publicCatalogue(actor.organizationId)
      expect(result[0]?.mapLocation).toEqual({ hotelId, hotelName: 'Hotel', latitude: 41.84, longitude: 23.48 })
      expect(JSON.stringify(result)).not.toContain('Private foreign hotel')
      expect(JSON.stringify(result)).not.toContain('Private address')
    } finally {
      await db.update(schema.apartments).set({ hotelId }).where(eq(schema.apartments.id, apartmentId))
      await db.delete(schema.hotels).where(eq(schema.hotels.id, foreignHotel!.id))
    }
  })
  it('uses the CRM photo order for publication and rejects invalid or stale reorders atomically', async () => {
    const { reorderApartmentPhotos } = await import('../server/modules/apartment/apartment-photos.service')
    const [second] = await db.insert(schema.attachments).values({ organizationId: actor.organizationId, entityType: 'apartment', entityId: apartmentId, fileName: 'second.jpg', mimeType: 'image/jpeg', storageKey: 'private/second', uploadedById: actor.id, position: 1 }).returning()
    await service.savePublication(actor, apartmentId, { ...draft, published: true, photoIds: [second!.id, photoId] })
    // Publication input order cannot override the property gallery.
    expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([photoId, second!.id])
    await expect(reorderApartmentPhotos({ ...actor, roles: ['cleaner'] }, apartmentId, { photoIds: [second!.id, photoId] })).rejects.toMatchObject({ statusCode: 403 })
    await expect(reorderApartmentPhotos({ ...actor, roles: ['manager'] }, apartmentId, { photoIds: [second!.id, photoId] })).rejects.toMatchObject({ statusCode: 403 })
    await expect(reorderApartmentPhotos({ ...actor, organizationId: foreignOrganization }, apartmentId, { photoIds: [second!.id, photoId] })).rejects.toMatchObject({ statusCode: 403 })
    for (const photoIds of [[photoId], [photoId, foreignPhotoId]]) {
      await expect(reorderApartmentPhotos(actor, apartmentId, { photoIds })).rejects.toMatchObject({ statusCode: 409 })
    }
    await expect(reorderApartmentPhotos(actor, apartmentId, { photoIds: [photoId, photoId] })).rejects.toMatchObject({ statusCode: 400 })
    expect((await service.getPublication(actor, apartmentId)).photoIds).toEqual([photoId, second!.id])
    await db.insert(schema.apartmentManagers).values({ organizationId: actor.organizationId, apartmentId, userId: actor.id })
    const saved = await reorderApartmentPhotos({ ...actor, roles: ['manager'] }, apartmentId, { photoIds: [second!.id, photoId] })
    expect(saved.map(photo => photo.id)).toEqual([second!.id, photoId])
    const { listApartments } = await import('../server/modules/apartment/apartment.service')
    const card = (await listApartments(actor)).find(apartment => apartment.id === apartmentId)!
    expect(card.photos.map(photo => photo.id)).toEqual([second!.id, photoId])
    expect(card.photo?.id).toBe(second!.id)
    expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([second!.id, photoId])
    // Legacy subsets no longer restrict the apartment gallery.
    await service.savePublication(actor, apartmentId, { ...draft, published: true, photoIds: [photoId] })
    expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([second!.id, photoId])
    await reorderApartmentPhotos(actor, apartmentId, { photoIds: [photoId, second!.id] })
    await service.savePublication(actor, apartmentId, { ...draft, published: true, photoIds: [photoId, second!.id] })
    expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([photoId, second!.id])
    const [original] = await db.select().from(schema.apartments).where(eq(schema.apartments.id, apartmentId))
    const [other] = await db.insert(schema.apartments).values({ organizationId: actor.organizationId, hotelId: original!.hotelId, apartmentTypeId: original!.apartmentTypeId, name: 'Other apartment', capacity: 2, rooms: 1, checkInTime: '15:00', checkOutTime: '11:00' }).returning()
    await expect(service.savePublication(actor, other!.id, { ...draft, photoIds: [] })).rejects.toMatchObject({ statusCode: 409 })
    await expect(service.savePublication(actor, other!.id, { ...draft, slug: 'no-photos', published: true, photoIds: [] })).rejects.toMatchObject({ statusCode: 400 })
    expect((await service.getPublication(actor, other!.id)).slug).toBe('hotel-other-apartment')
    expect((await service.getPublication(actor, apartmentId)).photoIds).toEqual([photoId, second!.id])
    const [third] = await db.insert(schema.attachments).values({ organizationId: actor.organizationId, entityType: 'apartment', entityId: apartmentId, fileName: 'third.jpg', mimeType: 'image/jpeg', storageKey: 'private/third', uploadedById: actor.id, position: 2 }).returning()
    await expect(reorderApartmentPhotos(actor, apartmentId, { photoIds: [second!.id, photoId] })).rejects.toMatchObject({ statusCode: 409 })
    const unchanged = await db.select({ id: schema.attachments.id, position: schema.attachments.position }).from(schema.attachments).where(eq(schema.attachments.id, third!.id))
    expect(unchanged).toEqual([{ id: third!.id, position: 2 }])
    await db.delete(schema.attachments).where(eq(schema.attachments.id, third!.id))
    await service.savePublication(actor, apartmentId, draft)
  })
  it('serves only apartment public images and revokes their URLs when hidden', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('getRouterParam', getRouterParam)
    vi.stubGlobal('setHeader', setHeader)
    const { fileStorage } = await import('../server/infrastructure/storage/local')
    await fileStorage.put('private/storage-key', await sharp({ create: { width: 4, height: 4, channels: 3, background: '#10251f' } }).jpeg().toBuffer())
    const handler = (await import('../server/api/catalogue/apartments/[slug]/photos/[photoId].get')).default
    const event = (id: string) => {
      const req = new IncomingMessage(new Socket()); req.url = '/photo?site=https%3A%2F%2Fpublic.example.test'; req.method = 'GET'
      const request = createEvent(req, new ServerResponse(req)); request.context.params = { slug: 'studio', photoId: id }; return request
    }
    await service.savePublication(actor, apartmentId, { ...draft, published: true })
    const request = event(photoId)
    const output = await handler(request)
    expect((await sharp(output as Buffer).metadata()).format).toBe('webp')
    expect(getResponseHeader(request, 'cache-control')).toBe('no-store')
    await expect(handler(event(foreignPhotoId))).rejects.toMatchObject({ statusCode: 404 })
    await service.savePublication(actor, apartmentId, draft)
    await expect(handler(event(photoId))).rejects.toMatchObject({ statusCode: 404 })
  })
  it('appends uploads after reordered photos and promotes the next photo after deleting the cover', async () => {
    const auth = await import('../server/infrastructure/auth/actor')
    const authMock = vi.spyOn(auth, 'requireActor').mockResolvedValue(actor)
    vi.stubGlobal('readMultipartFormData', readMultipartFormData)
    try {
      const { reorderApartmentPhotos } = await import('../server/modules/apartment/apartment-photos.service')
      const upload = (await import('../server/api/attachments/index.post')).default
      const remove = (await import('../server/api/attachments/[id].delete')).default
      const rows = await db.select({ id: schema.attachments.id }).from(schema.attachments).where(eq(schema.attachments.storageKey, 'private/second'))
      const secondId = rows[0]!.id
      await reorderApartmentPhotos(actor, apartmentId, { photoIds: [secondId, photoId] })
      await service.savePublication(actor, apartmentId, { ...draft, published: true, photoIds: [] })
      const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#10251f' } }).jpeg().toBuffer()
      const boundary = 'aparts-upload-test-boundary'
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="entityType"\r\n\r\napartment\r\n--${boundary}\r\nContent-Disposition: form-data; name="entityId"\r\n\r\n${apartmentId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="new.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        image, Buffer.from(`\r\n--${boundary}--\r\n`)
      ])
      const req = new IncomingMessage(new Socket()); req.url = '/api/attachments'; req.method = 'POST'
      req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) }
      req.push(body); req.push(null)
      const uploaded = await upload(createEvent(req, new ServerResponse(req)))
      expect(uploaded!.position).toBe(2)
      expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([secondId, photoId, uploaded!.id])
      const deleteEvent = (id: string) => {
        const request = new IncomingMessage(new Socket()); request.method = 'DELETE'; request.url = '/photo'
        const event = createEvent(request, new ServerResponse(request)); event.context.params = { id }; return event
      }
      // Existing publications may retain a legacy one-photo selection after upgrading.
      const [publication] = await db.select({ id: schema.apartmentPublications.id }).from(schema.apartmentPublications).where(eq(schema.apartmentPublications.apartmentId, apartmentId))
      await db.insert(schema.apartmentPublicationPhotos).values({ publicationId: publication!.id, attachmentId: secondId, position: 0 })
      await remove(deleteEvent(secondId))
      expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([photoId, uploaded!.id])
      await remove(deleteEvent(uploaded!.id))
      await service.savePublication(actor, apartmentId, draft)
    } finally { authMock.mockRestore() }
  })
  it('hides inactive apartments and automatically unpublishes after deleting the last photo', async () => {
    await service.savePublication(actor, apartmentId, { ...draft, published: true })
    await db.update(schema.apartments).set({ status: 'archived' }).where(eq(schema.apartments.id, apartmentId))
    expect(await service.publicCatalogue(actor.organizationId)).toEqual([])
    await expect(service.savePublication(actor, apartmentId, { ...draft, published: true })).rejects.toMatchObject({ statusCode: 400 })
    expect((await service.getPublication(actor, apartmentId)).published).toBe(false)
    await db.update(schema.apartments).set({ status: 'active' }).where(eq(schema.apartments.id, apartmentId))
    await service.savePublication(actor, apartmentId, { ...draft, published: true })
    await db.delete(schema.attachments).where(eq(schema.attachments.id, photoId))
    expect((await service.getPublication(actor, apartmentId)).published).toBe(false)
    expect(await service.publicCatalogue(actor.organizationId)).toEqual([])
    await db.delete(schema.apartments).where(eq(schema.apartments.id, apartmentId))
    expect(await db.select().from(schema.apartmentPublications).where(eq(schema.apartmentPublications.apartmentId, apartmentId))).toEqual([])
  })
})
