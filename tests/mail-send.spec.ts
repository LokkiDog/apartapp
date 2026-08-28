import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn()
}))

vi.mock('nodemailer', () => ({
  default: { createTransport }
}))

import { sendAccountLink } from '../server/infrastructure/mail/send'

const fetchMock = vi.fn()
const config: Record<string, any> = {
  public: { appUrl: 'https://crm.aparts-bansko.com' },
  smtpFrom: 'Aparts CRM <noreply@aparts-bansko.com>',
  smtpHost: 'localhost',
  smtpPort: '1025',
  smtpSecure: 'false'
}

beforeEach(() => {
  vi.clearAllMocks()
  delete config.brevoApiKey
  delete config.smtpUser
  delete config.smtpPassword
  createTransport.mockReturnValue({ sendMail })
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ messageId: 'message-id' }), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('useRuntimeConfig', () => config)
})

afterEach(() => vi.unstubAllGlobals())

describe('sendAccountLink', () => {
  it('uses the Brevo API when an API key is configured', async () => {
    config.brevoApiKey = 'brevo-api-key'

    await sendAccountLink({ to: 'user@example.com', name: 'Иван', type: 'invitation', token: 'test-token' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(request.headers['api-key']).toBe('brevo-api-key')
    expect(JSON.parse(request.body)).toEqual({
      sender: { name: 'Aparts CRM', email: 'noreply@aparts-bansko.com' },
      to: [{ email: 'user@example.com', name: 'Иван' }],
      subject: 'Приглашение в Aparts CRM',
      textContent: 'Здравствуйте, Иван! Создайте пароль для входа в Aparts CRM: https://crm.aparts-bansko.com/set-password?token=test-token&lang=ru'
    })
    expect(createTransport).not.toHaveBeenCalled()
  })

  it('reports a rejected Brevo API request', async () => {
    config.brevoApiKey = 'brevo-api-key'
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 }))

    await expect(sendAccountLink({ to: 'user@example.com', name: 'Иван', type: 'password_reset', token: 'test-token' }))
      .rejects.toThrow('Brevo API request failed (401)')
  })

  it('keeps SMTP as a fallback when no Brevo API key is configured', async () => {
    await sendAccountLink({ to: 'user@example.com', name: 'Иван', type: 'password_reset', token: 'test-token' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 1025,
      connectionTimeout: 10_000,
      socketTimeout: 15_000
    }))
    expect(sendMail).toHaveBeenCalledOnce()
  })
})
