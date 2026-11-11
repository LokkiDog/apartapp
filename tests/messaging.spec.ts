import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  telegramMessageContent,
  telegramRequest,
} from '../server/modules/messaging/telegram'
import {
  decryptBotToken,
  encryptBotToken,
  verifyWebhookSecret,
} from '../server/modules/messaging/secrets'
import { downloadLineFile, pushLineMessage, verifyLineSignature } from '../server/modules/messaging/line'
import { clientUpdateSchema } from '../shared/contracts/platform'
import { MAX_MESSAGE_FILE_BYTES } from '../shared/contracts/messaging'

// Protocol and credential contracts are exercised without access to an external bot.
afterEach(() => vi.unstubAllGlobals())

describe('Telegram transport and secrets', () => {
  it('encrypts tokens with authenticated encryption and rejects tampering', () => {
    const key = randomBytes(32).toString('hex')
    vi.stubGlobal('useRuntimeConfig', () => ({ messagingEncryptionKey: key }))
    const token = '123456:private-bot-token'
    const ciphertext = encryptBotToken(token)
    expect(ciphertext).not.toContain(token)
    expect(decryptBotToken(ciphertext)).toBe(token)
    const pieces = ciphertext.split('.')
    pieces[2] = Buffer.from('changed').toString('base64url')
    expect(() => decryptBotToken(pieces.join('.'))).toThrow()
    vi.stubGlobal('useRuntimeConfig', () => ({ messagingEncryptionKey: '' }))
    expect(() => encryptBotToken(token)).toThrow('Не настроен ключ')
  })

  it('authenticates webhooks and never accepts an absent or mismatched secret', () => {
    expect(verifyWebhookSecret('correct', 'correct')).toBe(true)
    expect(verifyWebhookSecret(undefined, 'correct')).toBe(false)
    expect(verifyWebhookSecret('wrong', 'correct')).toBe(false)
    expect(verifyWebhookSecret('incorre', 'correct')).toBe(false)
  })

  it.each([
    [
      { ok: false, error_code: 429, parameters: { retry_after: 60 } },
      'retry',
      60,
    ],
    [{ ok: false, error_code: 400 }, 'failed', 30],
    [{ ok: false, error_code: 503 }, 'retry', 30],
  ])(
    'classifies definite API failures for safe retry',
    async (response, outcome, retryAfter) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)))
      await expect(
        telegramRequest('token', 'sendMessage', {}),
      ).rejects.toMatchObject({ outcome, retryAfter })
    },
  )

  it('returns the API receipt and treats a lost response as unknown', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ok: true, result: { message_id: 42 } }),
      )
      .mockRejectedValueOnce(new Error('socket reset'))
    vi.stubGlobal('fetch', fetch)
    await expect(telegramRequest('token', 'sendMessage', {})).resolves.toEqual({
      message_id: 42,
    })
    await expect(
      telegramRequest('token', 'sendMessage', {}),
    ).rejects.toMatchObject({ outcome: 'unknown' })
  })

  it('keeps voice messages downloadable and marks oversized attachments unavailable', () => {
    const base = { message_id: 1, date: 1, chat: { id: 42, type: 'private' } }
    expect(
      telegramMessageContent({
        ...base,
        voice: { file_id: 'voice', mime_type: 'audio/ogg', file_size: 120 },
      }).file,
    ).toMatchObject({
      name: 'voice.ogg',
      mimeType: 'audio/ogg',
      available: true,
    })
    expect(
      telegramMessageContent({
        ...base,
        document: { file_id: 'large', file_size: MAX_MESSAGE_FILE_BYTES + 1 },
      }).file?.available,
    ).toBe(false)
    expect(telegramMessageContent(base).unsupported).toBe(true)
  })

  it('accepts an explicit module toggle and rejects string coercion', () => {
    expect(clientUpdateSchema.parse({ messagingEnabled: false })).toEqual({
      messagingEnabled: false,
    })
    expect(
      clientUpdateSchema.safeParse({ messagingEnabled: 'true' }).success,
    ).toBe(false)
  })
})

describe('LINE Messaging API transport', () => {
  it('checks the exact webhook bytes against an independent HMAC fixture', () => {
    const raw = Buffer.from('{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}')
    const signature = 'CaQfo/vpROry+7UB85x+gtiNTkKSZx76mCFrzUgf1Tg='
    const secret = 'line-test-secret'
    expect(verifyLineSignature(raw, signature, secret)).toBe(true)
    expect(verifyLineSignature(Buffer.concat([raw, Buffer.from(' ')]), signature, secret)).toBe(false)
  })

  it('preserves the retry key after a lost response and recognizes LINE acceptance', async () => {
    const keys: (string | null)[] = []
    const retryKey = randomUUID()
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      keys.push(new Headers(init.headers).get('x-line-retry-key'))
      if (keys.length === 1) throw new Error('network lost after sending')
      return new Response(null, { status: 409, headers: { 'x-line-accepted-request-id': 'accepted' } })
    })
    vi.stubGlobal('fetch', fetch)
    await expect(pushLineMessage('token', 'guest', 'Hello', retryKey)).rejects.toMatchObject({ outcome: 'retry' })
    await expect(pushLineMessage('token', 'guest', 'Hello', retryKey)).resolves.toBe('accepted')
    expect(keys).toEqual([retryKey, retryKey])
  })

  it('caps a streamed file even when LINE does not send a content length', async () => {
    const file = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MESSAGE_FILE_BYTES))
        controller.enqueue(new Uint8Array(1))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(file)))
    await expect(downloadLineFile('token', 'file')).resolves.toBeNull()
  })
})
