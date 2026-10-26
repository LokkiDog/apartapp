import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createError, createEvent, defineEventHandler, getRouterParam, setHeader, getResponseHeader } from 'h3'
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
    const [user] = await db.insert(schema.users).values({ organizationId: org!.id, email: 'publication@example.test', name: 'Admin', passwordHash: 'test-only', roles: ['administrator'] }).returning()
    const [foreignUser] = await db.insert(schema.users).values({ organizationId: foreign!.id, email: 'foreign-publication@example.test', name: 'Foreign admin', passwordHash: 'test-only', roles: ['administrator'] }).returning()
    actor = { id: user!.id, organizationId: org!.id, email: user!.email, name: user!.name, roles: ['administrator'], locale: 'ru' }
    const [hotel] = await db.insert(schema.hotels).values({ organizationId: org!.id, name: 'Hotel', address: 'Bansko', latitude: '41.84', longitude: '23.48' }).returning()
    const [type] = await db.insert(schema.apartmentTypes).values({ organizationId: org!.id, name: 'Studio', ownerTotalEur: 0, cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0 }).returning()
    const [apartment] = await db.insert(schema.apartments).values({ organizationId: org!.id, hotelId: hotel!.id, apartmentTypeId: type!.id, name: 'INTERNAL apartment', instructions: 'SECRET ENTRY CODE', capacity: 4, rooms: 2, checkInTime: '15:00', checkOutTime: '11:00' }).returning()
    apartmentId = apartment!.id
    const [photo, foreignPhoto] = await db.insert(schema.attachments).values([{ organizationId: org!.id, entityType: 'apartment', entityId: apartmentId, fileName: 'internal-name.jpg', mimeType: 'image/jpeg', storageKey: 'private/storage-key', uploadedById: user!.id }, { organizationId: foreign!.id, entityType: 'apartment', entityId: apartmentId, fileName: 'foreign.jpg', mimeType: 'image/jpeg', storageKey: 'foreign', uploadedById: foreignUser!.id }]).returning()
    photoId = photo!.id; foreignPhotoId = foreignPhoto!.id
    draft = { published: false, slug: 'studio', sortOrder: 0, translations: { ru: { title: 'Студия', summary: 'Для отдыха', description: 'Кухня и балкон.', location: '' } }, amenities: ['wifi'], photoIds: [photoId] }
  }, 30000)
  afterAll(async () => { await connection?.end(); if (storageRoot) await rm(storageRoot, { recursive: true, force: true }); vi.unstubAllGlobals() })
  it('enforces administrative and organization boundaries before reading or writing', async () => {
    await expect(service.getPublication({ ...actor, roles: ['manager'] }, apartmentId)).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.savePublication({ ...actor, roles: ['cleaner'] }, apartmentId, draft)).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.savePublication({ ...actor, organizationId: foreignOrganization }, apartmentId, draft)).rejects.toMatchObject({ statusCode: 404 })
    await expect(service.savePublication(actor, apartmentId, { ...draft, photoIds: [foreignPhotoId] })).rejects.toMatchObject({ statusCode: 400 })
  })
  it('keeps drafts private, publishes only guest fields and revokes visibility', async () => {
    await service.savePublication(actor, apartmentId, draft)
    expect(await service.publicCatalogue(actor.organizationId)).toEqual([])
    await service.savePublication(actor, apartmentId, { ...draft, published: true })
    const result = await service.publicCatalogue(actor.organizationId)
    expect(result).toEqual([{ slug: 'studio', title: 'Студия', summary: 'Для отдыха', description: 'Кухня и балкон.', location: '', capacity: 4, rooms: 2, checkInTime: '15:00', checkOutTime: '11:00', amenities: ['wifi'], photos: [{ id: photoId, url: `/api/catalogue/apartments/studio/photos/${photoId}` }] }])
    expect(await service.publicCatalogue(foreignOrganization)).toEqual([])
    await service.savePublication(actor, apartmentId, { ...draft, published: false })
    expect(await service.publicCatalogue(actor.organizationId, 'studio')).toEqual([])
  })
  it('preserves cover order across replacement and rejects duplicate page addresses atomically', async () => {
    const [second] = await db.insert(schema.attachments).values({ organizationId: actor.organizationId, entityType: 'apartment', entityId: apartmentId, fileName: 'second.jpg', mimeType: 'image/jpeg', storageKey: 'private/second', uploadedById: actor.id }).returning()
    await service.savePublication(actor, apartmentId, { ...draft, published: true, photoIds: [second!.id, photoId] })
    expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([second!.id, photoId])
    await service.savePublication(actor, apartmentId, { ...draft, published: true, photoIds: [photoId, second!.id] })
    expect((await service.publicCatalogue(actor.organizationId))[0]!.photos.map(photo => photo.id)).toEqual([photoId, second!.id])
    const [original] = await db.select().from(schema.apartments).where(eq(schema.apartments.id, apartmentId))
    const [other] = await db.insert(schema.apartments).values({ organizationId: actor.organizationId, hotelId: original!.hotelId, apartmentTypeId: original!.apartmentTypeId, name: 'Other apartment', capacity: 2, rooms: 1, checkInTime: '15:00', checkOutTime: '11:00' }).returning()
    await expect(service.savePublication(actor, other!.id, { ...draft, photoIds: [] })).rejects.toMatchObject({ statusCode: 409 })
    expect((await service.getPublication(actor, other!.id)).slug).toBe(`apartment-${other!.id}`)
    expect((await service.getPublication(actor, apartmentId)).photoIds).toEqual([photoId, second!.id])
    await service.savePublication(actor, apartmentId, draft)
  })
  it('serves only selected public images and revokes their URLs when hidden', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('getRouterParam', getRouterParam)
    vi.stubGlobal('setHeader', setHeader)
    vi.stubGlobal('useRuntimeConfig', () => ({ catalogueOrganizationId: actor.organizationId }))
    const { fileStorage } = await import('../server/infrastructure/storage/local')
    await fileStorage.put('private/storage-key', await sharp({ create: { width: 4, height: 4, channels: 3, background: '#10251f' } }).jpeg().toBuffer())
    const handler = (await import('../server/api/catalogue/apartments/[slug]/photos/[photoId].get')).default
    const event = (id: string) => {
      const req = new IncomingMessage(new Socket()); req.url = '/photo'; req.method = 'GET'
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
