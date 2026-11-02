import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import sharp from 'sharp'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { validateUploadedImage } from '../attachment/image-upload'
import { profileUpdateSchema } from '@contracts/platform'
import type { OwnProfile } from '../../../shared/contracts/public-site'

function ownUser(actor: Actor) {
  return and(eq(users.id, actor.id), eq(users.status, 'active'), actor.isSuperuser ? undefined : eq(users.organizationId, actor.organizationId))
}
export async function getOwnProfile(actor: Actor): Promise<OwnProfile> {
  const user = await db.query.users.findFirst({ where: ownUser(actor) })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  return { name: user.name, phone: user.phone, publicBio: user.publicBio, hasPhoto: Boolean(user.profilePhotoKey), photoVersion: user.updatedAt.toISOString() }
}
export async function updateOwnProfile(actor: Actor, input: unknown) {
  const data = profileUpdateSchema.parse(input)
  const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(ownUser(actor)).returning({ name: users.name })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' })
  return user
}
export async function ownProfilePhoto(actor: Actor) {
  const user = await db.query.users.findFirst({ where: ownUser(actor), columns: { profilePhotoKey: true } })
  if (!user?.profilePhotoKey) throw createError({ statusCode: 404 })
  try { return await fileStorage.get(user.profilePhotoKey) }
  catch (error: any) { if (error?.code === 'ENOENT') throw createError({ statusCode: 404 }); throw error }
}
export async function setOwnProfilePhoto(actor: Actor, file: { data: Buffer; type?: string } | null) {
  if (file && file.data.byteLength > 8 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Файл больше 8 МБ' })
  let content: Buffer | null = null
  if (file) {
    await validateUploadedImage(file.data, file.type ?? '')
    try { content = await sharp(file.data, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer() }
    catch { throw createError({ statusCode: 400, statusMessage: 'Не удалось прочитать изображение' }) }
  }
  // New objects are immutable. Serialize swaps so concurrent replacements clean up the right file.
  let nextKey: string | null = null
  let previousKey: string | null = null
  try {
    await db.transaction(async tx => {
      const [user] = await tx.select().from(users).where(ownUser(actor)).for('update')
      if (!user) throw createError({ statusCode: 404 })
      previousKey = user.profilePhotoKey
      nextKey = content ? `${user.organizationId}/profile/${user.id}/${randomUUID()}.webp` : null
      if (content && nextKey) await fileStorage.put(nextKey, content)
      await tx.update(users).set({ profilePhotoKey: nextKey, updatedAt: new Date() }).where(ownUser(actor))
    })
  } catch (error) { if (nextKey) await Promise.allSettled([fileStorage.remove(nextKey)]); throw error }
  if (previousKey) await Promise.allSettled([fileStorage.remove(previousKey)])
  return getOwnProfile(actor)
}
