import nodemailer from 'nodemailer'

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
  const smtpUser = config.smtpUser?.trim()
  const smtpPassword = config.smtpPassword
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together')
  const transport = nodemailer.createTransport({
    host: config.smtpHost || 'localhost',
    port: Number(config.smtpPort || 1025),
    secure: config.smtpSecure === 'true',
    auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined
  })
  await transport.sendMail({ from: config.smtpFrom || 'noreply@aparts.local', to: input.to, subject, text })
}
