export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/site.css', '@fontsource-variable/onest'],
  runtimeConfig: {
    catalogueApiBase: 'http://127.0.0.1:3000',
    public: {
      siteUrl: 'https://aparts-bansko.com',
      whatsapp: '',
      hostName: 'Вика',
      hostDescription: 'Помогу выбрать апартамент и буду на связи во время вашего отдыха.',
      hostPhoto: ''
    }
  },
  app: { head: { htmlAttrs: { lang: 'ru' }, link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
  typescript: { strict: true }
})
