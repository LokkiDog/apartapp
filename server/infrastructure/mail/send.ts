import nodemailer from 'nodemailer'

export async function sendAccountLink(input: { to: string; name: string; type: 'invitation' | 'password_reset'; token: string }) {
  const config = useRuntimeConfig()
  const baseUrl = config.public.appUrl || 'http://localhost:3000'
  const link = `${baseUrl}/set-password?token=${encodeURIComponent(input.token)}`
  const subject = input.type === 'invitation' ? 'Приглашение в Aparts CRM' : 'Восстановление пароля Aparts CRM'
  const text = input.type === 'invitation'
    ? `Здравствуйте, ${input.name}! Создайте пароль для входа в Aparts CRM: ${link}`
    : `Здравствуйте, ${input.name}! Установите новый пароль для Aparts CRM: ${link}`
  const transport = nodemailer.createTransport({ host: config.smtpHost || 'localhost', port: Number(config.smtpPort || 1025), secure: false })
  await transport.sendMail({ from: config.smtpFrom || 'noreply@aparts.local', to: input.to, subject, text })
}
