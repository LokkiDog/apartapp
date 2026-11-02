export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/site.css', '@fontsource-variable/onest', '@fontsource-variable/noto-sans-hebrew', '~/assets/catalogue.css'],
  runtimeConfig: {
    catalogueApiBase: 'http://127.0.0.1:3000',
    public: {
      siteUrl: 'https://aparts-bansko.com',
      whatsapp: '',
      hostName: 'Виктория',
      hostDescription: '',
      hostDescriptionEn: '',
      hostDescriptionHe: '',
      hostDescriptionBg: '',
      hostPhoto: '/images/vika.jpg'
    }
  },
  app: { head: { htmlAttrs: { lang: 'ru' }, link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
  typescript: { strict: true }
})
