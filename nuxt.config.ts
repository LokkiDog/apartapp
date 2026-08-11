import { resolve } from 'node:path'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@vite-pwa/nuxt'],
  css: [resolve(process.cwd(), 'src/app/styles/main.css')],
  alias: {
    '#fsd': resolve(process.cwd(), 'src'),
    '@contracts': resolve(process.cwd(), 'shared/contracts')
  },
  typescript: {
    strict: true,
    typeCheck: true
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    organizationName: process.env.ORGANIZATION_NAME || 'Aparts Bansko',
    bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
    bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: process.env.SMTP_PORT || '1025',
    smtpFrom: process.env.SMTP_FROM || 'noreply@aparts.local',
    vapidSubject: process.env.VAPID_SUBJECT,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'Aparts',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || ''
    }
  },
  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    manifest: {
      name: 'Aparts CRM',
      short_name: 'Aparts',
      lang: 'ru',
      display: 'standalone',
      background_color: '#f5f7f6',
      theme_color: '#1f5d50'
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
    }
  }
})
