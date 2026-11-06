const crmBrands = {
  aparts: {
    id: 'aparts',
    name: 'Aparts CRM',
    shortName: 'Aparts',
    logo: '',
    favicon: '/favicon.svg',
    faviconType: 'image/svg+xml',
    appleIcon: '/apple-touch-icon.png',
    icon192: '/pwa-192x192.png',
    icon512: '/pwa-512x512.png',
    maskableIcon: '/pwa-maskable-512x512.png'
  },
  magicmop: {
    id: 'magicmop',
    name: 'MagicMop',
    shortName: 'MagicMop',
    logo: '/brand/magicmop/logo.webp',
    favicon: '/brand/magicmop/favicon.svg',
    faviconType: 'image/svg+xml',
    faviconPng: '/brand/magicmop/favicon.png',
    faviconIco: '/brand/magicmop/favicon.ico',
    appleIcon: '/brand/magicmop/apple-touch-icon.png',
    icon192: '/brand/magicmop/pwa-192x192.png',
    icon512: '/brand/magicmop/pwa-512x512.png',
    maskableIcon: '/brand/magicmop/pwa-maskable-512x512.png'
  }
} as const

export function getCrmBrand(id = 'aparts') {
  if (id !== 'aparts' && id !== 'magicmop') throw new Error('CRM brand must be aparts or magicmop')
  return crmBrands[id]
}
