import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'

export const geminiClientPrefix = 'gemini.'
export const geminiClientIdSchema = z.string().max(2800).regex(/^gemini\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
const redirectUri = z.string().max(256)
  .regex(/^https:\/\/oauth-redirect(?:-sandbox|-test)?\.googleusercontent\.com\/[ar]\/[A-Za-z0-9][A-Za-z0-9_~.-]*$/)
const authMethods = z.enum(['none', 'client_secret_basic', 'client_secret_post'])
export const geminiRegistrationSchema = z.object({
  redirect_uris: z.array(redirectUri).min(1).max(6),
  token_endpoint_auth_method: authMethods.default('client_secret_basic'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).min(1)
    .refine(types => types.includes('authorization_code')).default(['authorization_code']),
  response_types: z.tuple([z.literal('code')]).default(['code']),
  client_name: z.string().max(200).optional()
})

const registrationPayload = z.tuple([authMethods, z.array(redirectUri).min(1).max(6), z.string()])

function sign(event: H3Event, purpose: 'registration' | 'secret', value: string) {
  const config = useRuntimeConfig(event)
  if (config.session.password.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'OAuth client registration is unavailable' })
  }
  return createHmac('sha256', config.session.password)
    .update(JSON.stringify(['crm-gemini-oauth-v1', new URL(config.public.appUrl).origin, purpose, value]))
    .digest('base64url')
}

function matches(secret: string, expected: string) {
  const input = Buffer.from(secret)
  const output = Buffer.from(expected)
  return input.length === output.length && timingSafeEqual(input, output)
}

export function registerGeminiClient(event: H3Event, input: z.infer<typeof geminiRegistrationSchema>) {
  // Sign the allowed callbacks and method so public registration needs no database writes.
  const payload = Buffer.from(JSON.stringify([input.token_endpoint_auth_method, input.redirect_uris, randomBytes(16).toString('base64url')]))
    .toString('base64url')
  const clientId = geminiClientPrefix + payload + '.' + sign(event, 'registration', payload)
  return {
    ...input,
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(input.token_endpoint_auth_method === 'none' ? {} : {
      client_secret: sign(event, 'secret', clientId),
      client_secret_expires_at: 0
    })
  }
}

export function readGeminiClient(event: H3Event, clientId: string) {
  if (!geminiClientIdSchema.safeParse(clientId).success) return null
  const [, payload, signature] = clientId.split('.') as [string, string, string]
  if (!matches(signature, sign(event, 'registration', payload))) return null
  const parsed = registrationPayload.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  if (!parsed.success) return null
  const [method, redirects] = parsed.data
  return { method, redirects }
}

export function verifyGeminiSecret(event: H3Event, clientId: string, secret: string | undefined) {
  return Boolean(secret && matches(secret, sign(event, 'secret', clientId)))
}
