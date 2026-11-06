import { resolve } from 'node:path'
import { specialServiceIconClientNames } from './shared/config/special-service-icons'
import { AUTH_SESSION_IDLE_MAX_AGE_SECONDS } from './shared/config/auth-session'

import { getCrmBrand } from './shared/config/crm-brand'

const brand = getCrmBrand(process.env.CRM_BRAND)

export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  devtools: { enabled: true },
  nitro: {
    experimental: { websocket: true }
  },
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@vite-pwa/nuxt', '@nuxtjs/i18n'],
  i18n: {
    baseUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
    defaultLocale: 'ru',
    strategy: 'no_prefix',
    langDir: 'locales',
    locales: [
      { code: 'ru', language: 'ru-RU', name: 'Русский', file: 'ru.json', dir: 'ltr' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json', dir: 'ltr' },
      { code: 'he', language: 'he-IL', name: 'עברית', file: 'he.json', dir: 'rtl' }
    ],
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts'
  },
  icon: {
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true, icons: specialServiceIconClientNames }
  },
  app: {
    head: {
      title: brand.name,
      viewport: 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
      meta: [
        { name: 'description', content: 'Операционная CRM для апарт-отелей' },
        { name: 'theme-color', content: '#1f5d50' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: brand.shortName },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
      ],
      link: [
        ...(brand.id === 'magicmop' ? [
          { rel: 'icon', type: 'image/x-icon', href: brand.faviconIco },
          { rel: 'icon', type: 'image/png', sizes: '64x64', href: brand.faviconPng },
          { rel: 'icon', type: brand.faviconType, sizes: 'any', href: brand.favicon }
        ] : [{ rel: 'icon', type: brand.faviconType, href: brand.favicon }]),
        { rel: 'apple-touch-icon', sizes: '180x180', href: brand.appleIcon }
      ]
    }
  },
  css: [resolve(process.cwd(), 'src/app/styles/main.css')],
  alias: {
    '#fsd': resolve(process.cwd(), 'src'),
    '#shared': resolve(process.cwd(), 'shared'),
    '@contracts': resolve(process.cwd(), 'shared/contracts')
  },
  typescript: {
    strict: true,
    typeCheck: true
  },
  vite: {
    build: {
      rolldownOptions: {
        output: {
          chunkFileNames(chunk) {
            return chunk.name === 'pdfmake' || chunk.name === 'vfs_fonts'
              ? '_nuxt/[name].[hash].js'
              : '_nuxt/[hash].js'
          }
        }
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/pdfmake/build/pdfmake')) return 'pdfmake'
            if (id.includes('/pdfmake/build/vfs_fonts')) return 'pdfmake-fonts'
          }
        }
      }
    }
  },
  runtimeConfig: {
    googleTranslationApiKey: '',
    googleTranslationMonthlyCharacterLimit: '450000',
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
      maxAge: AUTH_SESSION_IDLE_MAX_AGE_SECONDS
    },
    databaseUrl: process.env.DATABASE_URL,
    organizationName: process.env.ORGANIZATION_NAME || 'Aparts',
    superuserEmail: process.env.SUPERUSER_EMAIL,
    bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
    bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    brevoApiKey: process.env.BREVO_API_KEY,
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: process.env.SMTP_PORT || '1025',
    smtpFrom: process.env.SMTP_FROM || 'noreply@aparts.local',
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpSecure: process.env.SMTP_SECURE || 'false',
    vapidSubject: process.env.NUXT_VAPID_SUBJECT || process.env.VAPID_SUBJECT,
    vapidPublicKey: process.env.NUXT_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY,
    public: {
      brand,
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.NUXT_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
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
    includeAssets: [brand.favicon.slice(1), brand.appleIcon.slice(1)],
    manifest: {
      id: '/',
      name: brand.name,
      short_name: brand.shortName,
      description: 'Операционная CRM для апарт-отелей',
      lang: 'ru',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f5f7f6',
      theme_color: '#1f5d50',
      icons: [
        { src: brand.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: brand.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: brand.maskableIcon, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      globIgnores: ['**/pdfmake*.js', '**/vfs_fonts*.js'],
      maximumFileSizeToCacheInBytes: 1024 * 1024
    }
  }
})
