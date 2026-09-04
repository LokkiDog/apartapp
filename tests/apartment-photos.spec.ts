import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { supportedImageMimeTypes, validateUploadedImage } from '../server/modules/attachment/image-upload'

describe('apartment photos', () => {
  it('accepts only the supported image formats and verifies file contents', async () => {
    expect([...supportedImageMimeTypes]).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    const source = sharp({ create: { width: 2, height: 2, channels: 3, background: '#487a61' } })
    await expect(validateUploadedImage(await source.clone().jpeg().toBuffer(), 'image/jpeg')).resolves.toBe('image/jpeg')
    await expect(validateUploadedImage(await source.clone().png().toBuffer(), 'image/png')).resolves.toBe('image/png')
    await expect(validateUploadedImage(await source.clone().webp().toBuffer(), 'image/webp')).resolves.toBe('image/webp')
    await expect(validateUploadedImage(await source.clone().png().toBuffer(), 'image/jpeg')).rejects.toMatchObject({ statusCode: 400 })
    await expect(validateUploadedImage(await source.clone().png().toBuffer(), 'image/gif')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('keeps the first photo compatible while supplying an ordered gallery', () => {
    const service = readFileSync('server/modules/apartment/apartment.service.ts', 'utf8')
    const list = readFileSync('src/pages/apartments/ApartmentsPage.vue', 'utf8')
    const form = readFileSync('src/pages/apartments/ApartmentPhotoPanel.vue', 'utf8')

    expect(service).toContain('photo: photos[0] ?? null, photos')
    expect(service).toContain('.orderBy(asc(attachments.createdAt), asc(attachments.id))')
    expect(list).toContain('<ApartmentPhotoCarousel v-if="apartment.photos.length"')
    expect(form).toContain('accept="image/jpeg,image/png,image/webp" multiple')
    expect(form).toContain('URL.revokeObjectURL')
  })

  it('opens the apartment from the photo while keeping carousel controls independent', () => {
    const carousel = readFileSync('src/pages/apartments/ApartmentPhotoCarousel.vue', 'utf8')

    expect(carousel).toContain('<div class="apartment-photo-carousel" @keydown.stop>')
    expect(carousel).not.toContain('class="apartment-photo-carousel" @click.stop')
    expect(carousel).toContain('@click.stop="previous"')
    expect(carousel).toContain('@click.stop="next"')
  })
})
