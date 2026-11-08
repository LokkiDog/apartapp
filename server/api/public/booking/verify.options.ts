import { createError, defineEventHandler, getHeader, sendNoContent } from 'h3'
import { allowBookingOrigin } from '../../../infrastructure/booking/recaptcha'

export default defineEventHandler(event => {
  const config = useRuntimeConfig(event)
  allowBookingOrigin(event, {
    brandId: config.public.brand.id,
    secretKey: '',
    allowedOrigins: config.recaptchaAllowedOrigins,
    minimumScore: config.recaptchaMinimumScore
  })
  const headers = (getHeader(event, 'access-control-request-headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean)
  if (getHeader(event, 'access-control-request-method') !== 'POST' || headers.some(value => value !== 'content-type')) {
    throw createError({ statusCode: 403, message: 'Invalid preflight request' })
  }
  return sendNoContent(event)
})
