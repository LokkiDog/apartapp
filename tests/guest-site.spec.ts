import { describe, expect, it } from 'vitest'
import { siteUrl, whatsappUrl } from '../guest/shared/site'
import { catalogueRobots, catalogueSitemap } from '../guest/shared/seo'

describe('guest site links and indexing', () => {
  it('constructs absolute share URLs for configured production and local origins', () => {
    expect(siteUrl('https://aparts-bansko.com/', '/apartments/best-apart')).toBe('https://aparts-bansko.com/apartments/best-apart')
    expect(siteUrl('http://localhost:3001', '/apartments/best-apart')).toBe('http://localhost:3001/apartments/best-apart')
  })
  it('keeps the apartment and URL in the WhatsApp message and rejects invalid contacts', () => {
    const link = whatsappUrl('+359 (888) 123-456', 'Здравствуйте! Апартамент у гор: https://example.test/apartments/mountain')!
    expect(new URL(link).pathname).toBe('/359888123456')
    expect(new URL(link).searchParams.get('text')).toBe('Здравствуйте! Апартамент у гор: https://example.test/apartments/mountain')
    for (const value of ['', '123', 'not-a-number', '1234567890123456']) expect(whatsappUrl(value, 'Hello')).toBeUndefined()
  })
  it('excludes local previews from crawling and lists only supplied published pages', () => {
    expect(catalogueRobots('http://localhost:3001')).toBe('User-agent: *\nDisallow: /\n')
    expect(catalogueRobots('https://aparts-bansko.com')).toContain('Sitemap: https://aparts-bansko.com/sitemap.xml')
    const xml = catalogueSitemap('https://aparts-bansko.com', ['mountain-view'])
    expect(xml).toContain('<loc>https://aparts-bansko.com/</loc>')
    expect(xml).toContain('<loc>https://aparts-bansko.com/apartments/mountain-view</loc>')
    expect(xml).toContain('<loc>https://aparts-bansko.com/apartments</loc>')
    expect(xml).toContain('<loc>https://aparts-bansko.com/apartments?lang=en</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(12)
    expect(xml).toContain('<loc>https://aparts-bansko.com/apartments/mountain-view?lang=he</loc>')
    expect(xml).toContain('<loc>https://aparts-bansko.com/?lang=bg</loc>')
  })
})
