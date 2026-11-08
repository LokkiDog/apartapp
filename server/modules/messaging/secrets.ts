import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { createError } from 'h3'

function encryptionKey() {
  const key = useRuntimeConfig().messagingEncryptionKey
  if (typeof key !== 'string' || !/^[a-f\d]{64}$/i.test(key)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Не настроен ключ шифрования сообщений',
    })
  }
  return Buffer.from(key, 'hex')
}

export function encryptBotToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), encrypted]
    .map((value) => value.toString('base64url'))
    .join('.')
}

export function decryptBotToken(value: string) {
  try {
    const [iv, tag, encrypted] = value
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'))
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv!)
    decipher.setAuthTag(tag!)
    return Buffer.concat([
      decipher.update(encrypted!),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Не удалось расшифровать токен Telegram',
    })
  }
}

export function verifyWebhookSecret(
  actual: string | undefined,
  expected: string,
) {
  if (!actual) return false
  const supplied = Buffer.from(actual)
  const stored = Buffer.from(expected)
  return supplied.length === stored.length && timingSafeEqual(supplied, stored)
}
