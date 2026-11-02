import { guestLocales, localizedGuestPath } from './locale'
import { siteUrl } from './site'

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}
export function catalogueSitemap(base: string, slugs: string[]) {
  const paths = ['/', '/apartments', ...slugs.map(slug => `/apartments/${encodeURIComponent(slug)}`)].flatMap(path => guestLocales.map(locale => localizedGuestPath(path, locale)))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${escapeXml(siteUrl(base, path))}</loc></url>`).join('')}</urlset>`
}
export function catalogueRobots(base: string) {
  const host = new URL(base).hostname
  const local = host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]'
  return local ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${siteUrl(base, '/sitemap.xml')}\n`
}
