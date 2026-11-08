import { createError, defineEventHandler, getHeader, readValidatedBody } from 'h3'
import { z } from 'zod'
import { allowBookingOrigin, checkBookingRateLimit } from '../../../infrastructure/booking/recaptcha'
import { getBookingCalendar } from '../../../infrastructure/booking/calendly'

const schema = z.object({ eventId: z.uuid(), inviteeId: z.uuid() }).strict()

export default defineEventHandler(async event => {
  const config = useRuntimeConfig(event)
  allowBookingOrigin(event, {
    brandId: config.public.brand.id, secretKey: '',
    allowedOrigins: config.recaptchaAllowedOrigins,
    minimumScore: config.recaptchaMinimumScore
  })
  checkBookingRateLimit(event)
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw createError({ statusCode: 415, message: 'Expected JSON body' })
  }
  const body = await readValidatedBody(event, schema.parse)
  return getBookingCalendar(body.eventId.toLowerCase(), body.inviteeId.toLowerCase(), config.calendlyApiToken, config.calendlyEventName)
})
