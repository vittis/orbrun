import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { HOME, MOVED, PAGES, SITE_URL, addressKind, pageAt } from '../src/site'
import { robotsTxt, sitePageHtml, sitemapXml, sitePages } from '../site-pages'

const here = path.dirname(fileURLToPath(import.meta.url))
const template = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8')

/**
 * The pages a search engine is given, each a web page with its own head and
 * words, and the addresses it is not: the app's own screens say noindex, and anything
 * else is a 404 rather than another copy of the home page.
 */
describe('the site’s pages', () => {
  it('opens installed apps without forcing fullscreen', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(here, '..', 'public/manifest.webmanifest'), 'utf8'))
    expect(manifest.display).toBe('standalone')
  })

  it('ships page controls externally under a CSP that blocks remote HTML script execution', () => {
    const assets = new Map<string, string>()
    const generate = sitePages().generateBundle
    if (typeof generate !== 'function') throw new Error('missing site build hook')
    generate.call({ emitFile: (asset: { fileName: string; source: string }) => assets.set(asset.fileName, asset.source) } as never, {} as never, {}, false)
    expect(assets.get('site-controls.js')).toBe(fs.readFileSync(path.join(here, '..', 'site/site.js'), 'utf8'))
    const window = new Window()
    try {
      for (const [name, html] of assets) {
        if (!name.endsWith('.html')) continue
        const doc = new window.DOMParser().parseFromString(html, 'text/html')
        const executable = Array.from(doc.querySelectorAll('script')).filter((script) => script.type !== 'application/ld+json')
        expect(executable).toHaveLength(1)
        expect(executable[0].getAttribute('src')).toBe('/site-controls.js')
        expect(executable[0].textContent).toBe('')
        expect(executable[0].hasAttribute('defer')).toBe(true)
        for (const data of doc.querySelectorAll('script[type="application/ld+json"]')) expect(() => JSON.parse(data.textContent!)).not.toThrow()
        expect(doc.querySelector('a[href="https://github.com/vittis/orbrun/issues"]')).not.toBeNull()
        expect(html).not.toContain('cloudflare-online-v1.103/issues')
      }
      const headers = fs.readFileSync(path.join(here, '..', 'public/_headers'), 'utf8')
      expect(headers).toContain("script-src 'self'; script-src-attr 'none'")
      expect(headers).toContain("frame-src 'none'")
      expect(headers).not.toMatch(/unsafe-(inline|eval)/)
    } finally { void window.happyDOM.close() }
  })

  it('knows a page with or without its trailing slash, in any case', () => {
    expect(pageAt('/')).toBe(HOME)
    expect(pageAt('/about/steam/')?.doc).toBe('STEAM.md')
    expect(pageAt('/about/install')?.doc).toBe('INSTALL.md')
    expect(pageAt('/About/New')?.doc).toBe('CHANGELOG.md')
    expect(pageAt('/about/nope')).toBeNull()
  })

  it('tells pages from the app’s screens from nothing at all', () => {
    for (const p of ['/', '/about', '/about/new', '/about/steam', '/about/install']) expect(addressKind(p), p).toBe('page')
    for (const p of ['/connection-check', '/connection-check.html', '/settings', '/settings/camera', '/accounts/add', '/watch', '/watch/cdi', '/watch/cdi/bob', '/play/cdi/dcss-0.34', '/play/cdi/orbrun/dcss-0.34', '/login/cdi', '/register/crg', '/accounts/versions/cdi', '/accounts/rc/cdi/dcss-0.34', '/accounts/rc/offline', '/accounts/cdi', '/accounts/offline', '/accounts/morgues/cdi', '/accounts/morgues/offline/20261025-160942', '/whats-new'])
      expect(addressKind(p), p).toBe('app')
    for (const p of ['/wp-admin', '/about/nope', '/about/controls', '/about/how-it-works', '/index.php', '/play', '/settings/controls/gamepad/x', '/versions/cdi', '/accounts/versions', '/accounts/rc', '/accounts/rc/cdi/dcss-0.34/more', '/accounts/morgues', '/accounts/morgues/cdi/1/2']) expect(addressKind(p), p).toBe('none')
  })

  it('sends an address that moved to where it went', () => {
    expect(MOVED['/about/orbrun']).toBe('/about')
    expect(pageAt(MOVED['/about/orbrun'])).not.toBeNull()
    expect(pageAt('/about/orbrun')).toBeNull()
  })

  it('writes the home page’s head in index.html as the page list says it', () => {
    expect(template).toContain(`<title>${HOME.title}</title>`)
    expect(template).toContain(`content="${HOME.description}"`)
    expect(template).toContain(`<link rel="canonical" href="${SITE_URL}/" />`)
  })

  it('writes each other page as a web page of its own: its own head and breadcrumbs, its words, and no app', () => {
    const window = new Window()
    const html = sitePageHtml(pageAt('/about/steam')!, window as never)
    const doc = new window.DOMParser().parseFromString(html, 'text/html')
    expect(doc.title).toBe(pageAt('/about/steam')!.title)
    expect(doc.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe(`${SITE_URL}/about/steam`)
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${SITE_URL}/about/steam`)
    expect(doc.querySelector('meta[name=description]')?.getAttribute('content')).toBe(pageAt('/about/steam')!.description)
    const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(data['@graph'][1].itemListElement.map((i: { item: string }) => i.item)).toEqual([`${SITE_URL}/`, `${SITE_URL}/about`, `${SITE_URL}/about/steam`])
    expect(doc.querySelectorAll('h1')).toHaveLength(1)
    // the page is the site's, not the app's: nothing boots, and Play is a link to it
    expect(doc.getElementById('app')).toBeNull()
    expect(html).not.toContain('/src/main.ts')
    expect(doc.querySelector('.bar a.play')?.getAttribute('href')).toBe('/')
    void window.happyDOM.close()
  })

  it('lists a document’s sections to jump to, each with an address of its own', () => {
    const window = new Window()
    const doc = new window.DOMParser().parseFromString(sitePageHtml(pageAt('/about/steam')!, window as never), 'text/html')
    const jumps = Array.from(doc.querySelectorAll('.contents a'), (a) => a.getAttribute('href'))
    expect(jumps.length).toBeGreaterThan(0)
    for (const id of jumps) expect(doc.querySelector(`.doc h2${id}`), id!).not.toBeNull()
    // a changelog's releases are not worth a list
    const news = new window.DOMParser().parseFromString(sitePageHtml(pageAt('/about/new')!, window as never), 'text/html')
    expect(news.querySelector('.contents')).toBeNull()
    void window.happyDOM.close()
  })

  it('presents the current 2.5D product with accessible document navigation and shipped scenery', () => {
    const window = new Window()
    const doc = new window.DOMParser().parseFromString(sitePageHtml(pageAt('/about')!, window as never), 'text/html')
    expect(doc.querySelector('.skip')?.getAttribute('href')).toBe('#main')
    const jumps = Array.from(doc.querySelectorAll('.contents a'), (a) => a.getAttribute('href'))
    expect(jumps.length).toBeGreaterThan(0)
    for (const id of jumps) expect(doc.querySelector(`.doc h2${id}`), id!).not.toBeNull()
    expect(doc.querySelector('ul.pad-list .keys svg')).not.toBeNull()
    const poster = doc.querySelector('.hero img')!
    expect(poster.getAttribute('src')).toBe('/room/poster.jpg')
    expect(fs.existsSync(path.join(here, '..', 'public', poster.getAttribute('src')!))).toBe(true)
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE_URL}/room/card.jpg`)
    expect(doc.querySelector('a[href="https://github.com/vittis/orbrun/tree/cloudflare-online-v1.103"]')).not.toBeNull()
    void window.happyDOM.close()
  })

  it('lists every page in the sitemap, and points robots.txt at it', () => {
    const xml = sitemapXml(PAGES)
    for (const p of PAGES) expect(xml).toContain(`<loc>${SITE_URL}${p.path === '/' ? '/' : p.path}</loc>`)
    expect(robotsTxt()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
    expect(robotsTxt()).toMatch(/Disallow: \/gamedata-proxy\//)
  })
})
