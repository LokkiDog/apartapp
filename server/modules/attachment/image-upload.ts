import sharp from 'sharp'
import { createError } from 'h3'

export const supportedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const mimeByFormat: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export async function validateUploadedImage(data: Uint8Array, mimeType: string) {
  if (!supportedImageMimeTypes.has(mimeType)) throw createError({ statusCode: 400, statusMessage: 'Поддерживаются только JPG, PNG и WebP' })
  let format: string | undefined
  try { format = (await sharp(data).metadata()).format }
  catch { throw createError({ statusCode: 400, statusMessage: 'Не удалось прочитать изображение' }) }
  const actualMimeType = format ? mimeByFormat[format] : undefined
  if (!actualMimeType || actualMimeType !== mimeType) throw createError({ statusCode: 400, statusMessage: 'Формат изображения не соответствует файлу' })
  return actualMimeType
}
