import nodemailer from 'nodemailer'

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'
const MAIL_TIMEOUT_MS = 15_000

function parseSender(value: string) {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<\s*([^<>]+)\s*>\s*$/)
  if (!match) return { email: value.trim() }
  const name = match[1]?.trim()
  return { email: match[2]!.trim(), ...(name ? { name } : {}) }
}

async function sendWithBrevoApi(input: { apiKey: string; from: string; to: string; toName: string; subject: string; text: string }) {
  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': input.apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: parseSender(input.from),
      to: [{ email: input.to, name: input.toName }],
      subject: input.subject,
      textContent: input.text
    }),
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS)
  })
  if (response.ok) return
  const details = (await response.text()).trim().slice(0, 500)
  throw new Error(`Brevo API request failed (${response.status})${details ? `: ${details}` : ''}`)
}

export async function sendAccountLink(input: { to: string; name: string; type: 'invitation' | 'password_reset'; token: string; locale?: 'ru' | 'en' | 'he' }) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.appUrl || 'http://localhost:3000'
  const locale = input.locale ?? 'ru'
  const link = `${baseUrl}/set-password?token=${encodeURIComponent(input.token)}&lang=${locale}`
  const copy = locale === 'en'
    ? { invitation: 'Invitation to Aparts CRM', reset: 'Reset your Aparts CRM password', hello: 'Hello', inviteText: 'Create a password to sign in to Aparts CRM', resetText: 'Set a new password for Aparts CRM' }
    : locale === 'he'
      ? { invitation: 'הזמנה ל־Aparts CRM', reset: 'איפוס סיסמה ל־Aparts CRM', hello: 'שלום', inviteText: 'צרו סיסמה כדי להיכנס ל־Aparts CRM', resetText: 'הגדירו סיסמה חדשה ל־Aparts CRM' }
      : { invitation: 'Приглашение в Aparts CRM', reset: 'Восстановление пароля Aparts CRM', hello: 'Здравствуйте', inviteText: 'Создайте пароль для входа в Aparts CRM', resetText: 'Установите новый пароль для Aparts CRM' }
  const subject = input.type === 'invitation' ? copy.invitation : copy.reset
  const text = `${copy.hello}, ${input.name}! ${input.type === 'invitation' ? copy.inviteText : copy.resetText}: ${link}`
  const from = config.smtpFrom || 'noreply@aparts.local'
  const brevoApiKey = config.brevoApiKey?.trim()
  if (brevoApiKey) {
    await sendWithBrevoApi({ apiKey: brevoApiKey, from, to: input.to, toName: input.name, subject, text })
    return
  }
  const smtpUser = config.smtpUser?.trim()
  const smtpPassword = config.smtpPassword
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) throw new Error('NUXT_SMTP_USER and NUXT_SMTP_PASSWORD must be configured together')
  const transport = nodemailer.createTransport({
    host: config.smtpHost || 'localhost',
    port: Number(config.smtpPort || 1025),
    secure: config.smtpSecure === 'true',
    auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: MAIL_TIMEOUT_MS
  })
  await transport.sendMail({ from, to: input.to, subject, text })
}
