import sharp from 'sharp'
import { publicPhotos, publicPublicationRows } from '../../../../../modules/publication/publication.service'
import { fileStorage } from '../../../../../infrastructure/storage/local'
export default defineEventHandler(async event => {
  const organizationId = useRuntimeConfig(event).catalogueOrganizationId
  const [row] = await publicPublicationRows(organizationId, getRouterParam(event, 'slug')!)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Фото не найдено' })
  const photos = await publicPhotos(row.publication.id, organizationId, row.publication.apartmentId)
  const photo = photos.find(item => item.id === getRouterParam(event, 'photoId'))
  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Фото не найдено' })
  try {
    // Re-encode to strip metadata; original operational files are never exposed.
    const content = await sharp(await fileStorage.get(photo.storageKey)).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
    setHeader(event, 'content-type', 'image/webp')
    setHeader(event, 'cache-control', 'no-store')
    return content
  } catch (error: any) {
    if (error?.code === 'ENOENT') throw createError({ statusCode: 404, statusMessage: 'Фото не найдено' })
    throw error
  }
})
