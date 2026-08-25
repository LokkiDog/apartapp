import { resolve } from 'node:path'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@vite-pwa/nuxt'],
  app: {
    head: {
      title: 'Aparts CRM',
      viewport: 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
      meta: [
        { name: 'description', content: 'Операционная CRM для апарт-отелей' },
        { name: 'theme-color', content: '#1f5d50' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Aparts' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    }
  },
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
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpSecure: process.env.SMTP_SECURE || 'false',
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
    client: {
      installPrompt: 'aparts-pwa-install-dismissed'
    },
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: '/',
      name: 'Aparts CRM',
      short_name: 'Aparts',
      description: 'Операционная CRM для апарт-отелей',
      lang: 'ru',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f5f7f6',
      theme_color: '#1f5d50',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
    }
  }
})
