import { createError, defineEventHandler, getHeader, readValidatedBody } from 'h3'
import { z } from 'zod'
import { allowBookingOrigin, checkBookingRateLimit, verifyBookingToken } from '../../../infrastructure/booking/recaptcha'

const bodySchema = z.object({ token: z.string().trim().min(1).max(8000) }).strict()

export default defineEventHandler(async event => {
  const config = useRuntimeConfig(event)
  const settings = {
    brandId: config.public.brand.id,
    secretKey: config.recaptchaSecretKey || process.env.RECAPTCHA_SECRET_KEY || '',
    allowedOrigins: config.recaptchaAllowedOrigins,
    minimumScore: config.recaptchaMinimumScore
  }
  const hostname = allowBookingOrigin(event, settings)
  checkBookingRateLimit(event)
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw createError({ statusCode: 415, message: 'Expected JSON body' })
  }
  const { token } = await readValidatedBody(event, bodySchema.parse)
  return verifyBookingToken(token, hostname, settings)
})
