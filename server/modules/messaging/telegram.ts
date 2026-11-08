import { MAX_MESSAGE_FILE_BYTES } from '../../../shared/contracts/messaging'

export class TelegramError extends Error {
  constructor(
    public readonly outcome: 'retry' | 'failed' | 'unknown',
    public readonly retryAfter = 30,
  ) {
    super(`Telegram ${outcome}`)
  }
}

export async function telegramRequest<T>(
  token: string,
  method: string,
  body: Record<string, unknown> | FormData,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers:
        body instanceof FormData
          ? undefined
          : { 'content-type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
      redirect: 'error',
    })
  } catch {
    throw new TelegramError('unknown')
  }
  let result: {
    ok: boolean
    result: T
    error_code?: number
    parameters?: { retry_after?: number }
  }
  try {
    result = (await response.json()) as typeof result
  } catch {
    throw new TelegramError('unknown')
  }
  if (result.ok === true) return result.result
  if (result.error_code === 429)
    throw new TelegramError(
      'retry',
      Math.max(1, result.parameters?.retry_after ?? 30),
    )
  if (result.error_code && result.error_code >= 500)
    throw new TelegramError('retry')
  if (result.ok === false) throw new TelegramError('failed')
  throw new TelegramError('unknown')
}

export async function downloadTelegramFile(token: string, fileId: string) {
  const file = await telegramRequest<{
    file_path?: string
    file_size?: number
  }>(token, 'getFile', { file_id: fileId })
  if (
    !file.file_path ||
    (file.file_size ?? 0) > MAX_MESSAGE_FILE_BYTES ||
    !/^[\w./-]+$/.test(file.file_path) ||
    file.file_path.includes('..')
  )
    throw new TelegramError('failed')
  let response: Response
  try {
    response = await fetch(
      `https://api.telegram.org/file/bot${token}/${file.file_path}`,
      { signal: AbortSignal.timeout(25_000), redirect: 'error' },
    )
  } catch {
    throw new TelegramError('retry')
  }
  if (!response.ok || !response.body) throw new TelegramError('retry')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_MESSAGE_FILE_BYTES) throw new TelegramError('failed')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}

export interface TelegramFile {
  file_id: string
  file_size?: number
  file_name?: string
  mime_type?: string
}
export interface TelegramMessage {
  message_id: number
  date: number
  chat: {
    id: number
    type: string
    first_name?: string
    last_name?: string
    username?: string
  }
  text?: string
  caption?: string
  photo?: TelegramFile[]
  document?: TelegramFile
  voice?: TelegramFile
  audio?: TelegramFile
  video?: TelegramFile
  video_note?: TelegramFile
  animation?: TelegramFile
  sticker?: TelegramFile
}

export function telegramMessageContent(message: TelegramMessage) {
  const photo = message.photo?.at(-1)
  const media =
    photo ??
    message.document ??
    message.voice ??
    message.audio ??
    message.video ??
    message.video_note ??
    message.animation ??
    message.sticker
  const mimeType =
    media?.mime_type ?? (photo ? 'image/jpeg' : 'application/octet-stream')
  return {
    text: message.text ?? message.caption ?? '',
    unsupported:
      !media && message.text === undefined && message.caption === undefined,
    file: media
      ? {
          externalFileId: media.file_id,
          size: media.file_size ?? 0,
          name:
            media.file_name ??
            (photo ? 'photo.jpg' : message.voice ? 'voice.ogg' : 'attachment'),
          mimeType,
          available: (media.file_size ?? 0) <= MAX_MESSAGE_FILE_BYTES,
        }
      : null,
  }
}
