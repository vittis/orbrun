import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import type { Plugin } from 'vite'
import { BEACON_SRC } from './src/analytics'
import { glyph, type GlyphName } from './src/glyphs'
import { renderMarkdown } from './src/markdown'
import { HOME, PAGES, SITE_URL, pageAt, type Page } from './src/site'

/**
 * The site's pages (src/site.ts PAGES) as web pages of their own: About &
 * credits and its documents, for a reader who arrived from a search or a
 * link and has never played. No app in them: the words, stills of real
 * games, and a way to Play. The home page is the app, index.html as
 * written, with its own words for crawlers in `#page`.
 *
 * Each is written as `about/steam.html`, which the Worker's static assets
 * serve at `/about/steam` (Cloudflare's html_handling), beside
 * `sitemap.xml` and `robots.txt`. The dev server draws them on each request,
 * so an edit to a document or to site/ shows on a reload.
 *
 * Styles are inlined; site/site.js is emitted as a same-origin asset so the
 * site's CSP can reject all inline executable scripts and event handlers.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

/** where the markdown reader points a link to another file of the repository (markdown.ts REPO_BLOB) */
const REPO_BLOB = 'https://github.com/vittis/orbrun/blob/cloudflare-online-v1.77/'
const SOURCE = 'https://github.com/vittis/orbrun/tree/cloudflare-online-v1.77'
const ISSUES = 'https://github.com/vittis/orbrun/issues'
const SITE_SCRIPT_PATH = '/site-controls.js'

/** the poster's words, as index.html's card has them */
const POSTER_ALT = 'The bundled front room rendered in Dungeon 2.5D'


/** the pad's buttons as the documents name them in bold, and the app's glyph for each (glyphs.ts) */
const PAD_BUTTONS: Record<string, GlyphName> = { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', L3: 'L3', R3: 'R3', Select: 'SELECT', Start: 'START' }

/** the words a line of the controls opens on when it is about the sticks and the d-pad, not a button */
const MOVE_LINE = /^Left stick or d-pad\b/

/** The site draws the buttons as the game draws an Xbox-style pad's, the Steam Deck's own layout. */
const PAD_KIND = 'xbox'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const url = (p: Page) => SITE_URL + (p.path === '/' ? '/' : p.path)

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** the DOM the app's reader and glyphs draw with (dom.ts `h`, glyphs.ts): `document` and `Node`, lent from happy-dom */
type Dom = { document: Document; Node: typeof Node }

/** `fn` with the DOM lent as the app's own code expects to find it */
function withDom<T>(dom: Dom, fn: () => T): T {
  const g = globalThis as Partial<Dom>
  const before = { document: g.document, Node: g.Node }
  Object.assign(g, { document: dom.document, Node: dom.Node })
  try {
    return fn()
  } finally {
    Object.assign(g, before)
  }
}

/** a pad button as the game draws it, with its name for a reader who cannot see it */
function glyphEl(dom: Dom, name: GlyphName, label: string): HTMLElement {
  const el = dom.document.createElement('span')
  el.className = 'glyph'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', label)
  el.append(withDom(dom, () => glyph(name, PAD_KIND)))
  return el
}

const glyphHtml = (dom: Dom, name: GlyphName, label: string) => glyphEl(dom, name, label).outerHTML

/**
 * A list of what the pad's buttons do, as a legend: each line's buttons in a
 * column of their own, drawn as the game draws them, and what they do beside
 * them. A list is one when most of its lines open on a button.
 */
function padLegend(list: HTMLUListElement, dom: Dom) {
  const isGlyph = (n: ChildNode | null) => n?.nodeType === 1 && (n as Element).classList.contains('glyph')
  const isGap = (n: ChildNode | null) => n?.nodeType === 3 && /^\s*(or)?\s*$/.test(n.textContent ?? '')
  const items = [...list.children] as HTMLElement[]
  const lines = items.filter((li) => isGlyph(li.firstChild) || MOVE_LINE.test(li.textContent ?? ''))
  if (lines.length < items.length / 2) return
  list.classList.add('pad-list')
  for (const li of items) {
    const keys = dom.document.createElement('span')
    keys.className = 'keys'
    if (MOVE_LINE.test(li.textContent ?? '')) keys.append(glyphEl(dom, 'LSTICK', 'Left stick'), glyphEl(dom, 'DPAD', 'D-pad'))
    // the buttons the line opens on, and the "or" between two of them
    else
      while (isGlyph(li.firstChild) || (isGap(li.firstChild) && isGlyph(li.firstChild!.nextSibling))) {
        const node = li.firstChild!
        if (isGlyph(node)) keys.append(node)
        else node.remove()
      }
    const words = dom.document.createElement('span')
    words.className = 'does'
    words.append(...li.childNodes)
    if (words.firstChild?.nodeType === 3) words.firstChild.textContent = words.firstChild.textContent!.trimStart()
    li.append(keys, words)
  }
}

/** a picture of the site's own (`/steam/art/grid.png`), and its size as the file has it */
const ART = /^\/steam\/art\/[\w-]+\.png$/
function pngSize(href: string): { width: number; height: number } {
  const head = fs.readFileSync(path.join(HERE, 'public', href))
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

/**
 * A list of pictures to save (Steam's artwork): each line opens on the
 * picture itself, a link to the file, beside what it is for.
 */
function artList(list: HTMLUListElement, dom: Dom) {
  const items = [...list.children] as HTMLElement[]
  const art = items.map((li) => li.querySelector<HTMLAnchorElement>('a[href]'))
  if (!items.length || art.some((a) => !a || !ART.test(a.getAttribute('href') ?? ''))) return
  list.classList.add('art-list')
  items.forEach((li, i) => {
    const href = art[i]!.getAttribute('href')!
    const { width, height } = pngSize(href)
    const shot = dom.document.createElement('a')
    shot.className = 'shot'
    shot.setAttribute('href', href)
    shot.setAttribute('aria-hidden', 'true')
    shot.tabIndex = -1
    shot.innerHTML = `<img src="${esc(href)}" alt="" width="${width}" height="${height}" loading="lazy" />`
    const words = dom.document.createElement('span')
    words.append(...li.childNodes)
    li.append(shot, words)
  })
}

/**
 * A document drawn by the app's own reader for a page of its own: its title
 * is the page's (left out here), its sections are h2 with an address each,
 * the site's own documents are linked on the site, a link out opens a tab,
 * and a pad button named in bold is drawn as a button.
 */
export function docHtml(file: string, dom: Dom): { html: string; sections: { id: string; name: string }[] } {
  const doc = dom.document
  const el = withDom(dom, () => renderMarkdown(fs.readFileSync(path.join(ROOT, file), 'utf8'), { dropTitle: true }))
  {
    // the reader starts at h2, under the screen's own head; here the page's head is the h1, so its sections are h2
    for (const head of [...el.querySelectorAll('h3, h4, h5, h6')]) {
      const up = doc.createElement(`h${Number(head.tagName[1]) - 1}`)
      up.append(...head.childNodes)
      head.replaceWith(up)
    }
    const sections: { id: string; name: string }[] = []
    for (const h2 of el.querySelectorAll('h2')) {
      let id = slug(h2.textContent ?? '')
      while (sections.some((s) => s.id === id)) id += '-'
      h2.id = id
      sections.push({ id, name: h2.textContent ?? '' })
    }
    for (const a of el.querySelectorAll('a')) {
      const href = a.getAttribute('href') ?? ''
      const page = href.startsWith(REPO_BLOB) && PAGES.find((p) => p.doc === href.slice(REPO_BLOB.length))
      const local = page ? page.path : href.startsWith(SITE_URL) ? href.slice(SITE_URL.length) || '/' : null
      if (local) {
        // a link that names the file (`STEAM.md`) names the page it is here
        if (page && a.textContent === page.doc) a.textContent = page.name
        a.setAttribute('href', local)
        a.removeAttribute('target')
        a.removeAttribute('rel')
      } else if (/^https?:/.test(href)) {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noopener')
      }
    }
    for (const b of [...el.querySelectorAll('strong')]) {
      const name = b.textContent ?? ''
      if (name in PAD_BUTTONS) b.replaceWith(glyphEl(dom, PAD_BUTTONS[name], name))
    }
    for (const list of [...el.querySelectorAll('ul')]) padLegend(list as HTMLUListElement, dom)
    for (const list of [...el.querySelectorAll('ul')]) artList(list as HTMLUListElement, dom)
    // the name to type (`Orbrun`) set as the name is drawn, not as code
    for (const code of [...el.querySelectorAll('code')]) {
      if (code.textContent !== 'Orbrun' || code.parentElement?.tagName === 'PRE') continue
      const name = doc.createElement('span')
      name.className = 'name'
      name.textContent = 'Orbrun'
      code.replaceWith(name)
    }
    // each section a part of its own, drawn as a card; a step's number and a release's date set apart from its name (the words stay as they read)
    for (const h2 of [...el.querySelectorAll('h2')]) {
      const part = doc.createElement('section')
      part.className = 'part'
      h2.before(part)
      part.append(h2)
      while (part.nextSibling && (part.nextSibling as Element).tagName !== 'H2') part.append(part.nextSibling)
      const text = h2.textContent ?? ''
      const step = /^(\d+)\.\s+(.*)$/.exec(text)
      const release = /^(.+?) — (.+)$/.exec(text)
      if (step) h2.innerHTML = `<span class="n">${esc(step[1])}<span class="sep">.</span></span> ${esc(step[2])}`
      else if (release) h2.innerHTML = `<span class="ver">${esc(release[1])}</span><span class="sep"> — </span><span class="when">${esc(release[2])}</span>`
    }
    return { html: el.innerHTML, sections }
  }
}

/** Home › About & credits › the page: the trail a search result shows in place of the address */
function structuredData(page: Page): string {
  const trail = [HOME, ...PAGES.filter((p) => p.path !== '/' && (page.path === p.path || page.path.startsWith(p.path + '/')))]
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url(page), url: url(page), name: page.title, description: page.description, inLanguage: 'en', isPartOf: { '@id': `${SITE_URL}/#website` } },
      { '@type': 'BreadcrumbList', itemListElement: trail.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, item: url(p) })) },
    ],
  }).replace(/</g, '\\u003c')
}

function head(page: Page, css: string, beacon: string): string {
  const card = { src: '/room/card.jpg', alt: POSTER_ALT }
  const title = esc(page.title)
  const description = esc(page.description)
  return `<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#000000" />
<meta name="color-scheme" content="dark" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${url(page)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Orbrun" />
<meta property="og:locale" content="en_US" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url(page)}" />
<meta property="og:image" content="${SITE_URL}${card.src}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1280" />
<meta property="og:image:height" content="720" />
<meta property="og:image:alt" content="${esc(card.alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${SITE_URL}${card.src}" />
<script type="application/ld+json">${structuredData(page)}</script>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="application-name" content="Orbrun" />
<meta name="apple-mobile-web-app-title" content="Orbrun" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="preload" href="/fonts/grenze-gotisch-700-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/dejavu-sans-mono-700.woff2" as="font" type="font/woff2" crossorigin />
<style>
${css}
</style>${beacon ? `\n<script defer src="${BEACON_SRC}" data-cf-beacon="${esc(JSON.stringify({ token: beacon }))}"></script>` : ''}
</head>`
}

function bar(page: Page): string {
  const docs = PAGES.filter((p) => p.path !== '/')
  return `<header class="bar solid">
  <a class="brand" href="/"><img src="/orb.png" alt="" width="32" height="32" />Orbrun</a>
  <nav aria-label="About Orbrun">
    ${docs.map((p) => `<a href="${p.path}"${p === page ? ' aria-current="page"' : ''}>${esc(p.name)}</a>`).join('\n    ')}
    <a href="${SOURCE}" target="_blank" rel="noopener">Source</a>
  </nav>
  <a class="btn play" href="/">▶ Play</a>
</header>`
}

/** Current documents share the 2.5D room poster; no obsolete gameplay screenshots ship. */
const DOC_LOOK: Record<string, { tint: string; sub?: () => string }> = {
  '/about': { tint: 'dungeon' },
  '/about/new': { tint: 'depths', sub: () => latestRelease() },
  '/about/steam': { tint: 'abyss' },
  '/about/install': { tint: 'lair' },
}

/** the changelog's newest release, as its heading names it: "Version 0.2.1 · 2026-09-25" */
function latestRelease(): string {
  const head = /^## (.+?) — (\d{4}-\d{2}-\d{2})/m.exec(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'))
  return head ? `Version ${head[1]} · ${head[2]}` : 'Newest first'
}

/** a document's page: its name over a still, as About's acts open, its sections as cards */
function docMain(page: Page, dom: Dom): string {
  const look = DOC_LOOK[page.path]
  if (!look) throw new Error(`site-pages: no look for ${page.path}`)
  const { html, sections } = docHtml(page.doc!, dom)
  const contents =
    page.contents && sections.length > 2
      ? `<nav class="contents" aria-label="On this page">
  <h2>On this page</h2>
  <ul>
    ${sections.map((s) => `<li><a href="#${s.id}">${esc(s.name)}</a></li>`).join('\n    ')}
  </ul>
</nav>`
      : ''
  return `<section class="hero band ${look.tint}">
  <img src="/room/poster.jpg" alt="" width="1280" height="720" fetchpriority="high" />
  <div class="title">
    <header class="label"><h1><span aria-hidden="true">@</span>${esc(page.name)}</h1>${look.sub ? `<p>${esc(look.sub())}</p>` : ''}</header>
    <p class="lede">${esc(page.description)}</p>
  </div>
</section>
${contents}
<article class="doc ${slug(page.doc!.replace(/\.md$/, ''))}">
${html}
</article>`
}

/**
 * A page of the site at `page.path`, whole. With a `beacon` token it carries
 * Cloudflare's beacon as the app does (analytics.ts), so a visit that reads
 * About and leaves is counted too.
 */
export function sitePageHtml(page: Page, dom: Dom, beacon = ''): string {
  const css = fs.readFileSync(path.join(HERE, 'site/site.css'), 'utf8')
  return `<!doctype html>
<html lang="en">
${head(page, css, beacon)}
<body>
<a class="skip" href="#main">Skip to the words</a>
${bar(page)}
<main id="main">
${docMain(page, dom)}
<section class="cta">
  <p>The dungeon is waiting.</p>
  <a class="btn play" href="/">▶ Play Orbrun</a>
</section>
</main>
<footer>
  <div class="links">
    <a href="/about">About</a>
    <a href="${SOURCE}" target="_blank" rel="noopener">Source on GitHub</a>
    <a href="https://crawl.develz.org/" target="_blank" rel="noopener">Dungeon Crawl Stone Soup</a>
    <a href="https://pocketzot.app/about" target="_blank" rel="noopener">PocketZot</a>
    <a href="${ISSUES}" target="_blank" rel="noopener">Report a bug</a>
  </div>
  Orbrun is an unofficial client for Dungeon Crawl Stone Soup on the public servers. Not affiliated with the DCSS team.
</footer>
<div class="prompts" aria-hidden="true">
  <span class="chip">${glyphHtml(dom, 'A', 'A')}Open</span>
  ${page.doc ? `<span class="chip">${glyphHtml(dom, 'LB', 'LB')}${glyphHtml(dom, 'RB', 'RB')}Sections</span>` : ''}
  <span class="chip">${glyphHtml(dom, 'B', 'B')}Back to the game</span>
  ${page.path === '/about' ? `<span class="chip">${glyphHtml(dom, 'RSTICK', 'Right stick')}Scroll</span>` : ''}
</div>
<script defer src="${SITE_SCRIPT_PATH}"></script>
</body>
</html>
`
}

/** when a document last changed, from git; nothing when the checkout is shallow and every file would read as today */
function lastmod(file: string): string | null {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (git('rev-parse', '--is-shallow-repository') !== 'false') return null
    return git('log', '-1', '--format=%cs', '--', file) || null
  } catch {
    return null
  }
}

export function sitemapXml(pages: Page[]): string {
  const entries = pages.map((p) => {
    const mod = p.doc ? lastmod(p.doc) : null
    return `  <url>\n    <loc>${url(p)}</loc>${mod ? `\n    <lastmod>${mod}</lastmod>` : ''}\n  </url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
}

/** the proxies and the engine are plumbing, not pages; the app's own screens say `noindex` for themselves (worker/index.ts) */
export function robotsTxt(): string {
  return ['User-agent: *', 'Disallow: /gamedata-proxy/', 'Disallow: /morgue-proxy/', 'Disallow: /engine/', '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n')
}

/** each of the site's pages, drawn with a DOM of its own that is closed after */
function drawPages(pages: Page[], each: (page: Page, html: string) => void, beacon = '') {
  const window = new Window()
  try {
    for (const page of pages) each(page, sitePageHtml(page, window as unknown as Dom, beacon))
  } finally {
    void window.happyDOM.close()
  }
}

export function sitePages(): Plugin {
  // the build's beacon token, as the app reads it (analytics.ts); the dev server draws pages without it
  let beacon = ''
  return {
    name: 'orbrun-site-pages',
    configResolved(config) {
      beacon = String(config.env.VITE_CF_BEACON_TOKEN ?? '').trim()
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const at = new URL(req.url ?? '/', 'http://dev').pathname
        if (at === SITE_SCRIPT_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(HERE, 'site/site.js'), 'utf8'))
          return
        }
        const page = pageAt(at)
        if (!page || page.path === '/' || at !== page.path || (req.method !== 'GET' && req.method !== 'HEAD')) return next()
        drawPages([page], (_, html) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        })
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SITE_SCRIPT_PATH.slice(1), source: fs.readFileSync(path.join(HERE, 'site/site.js'), 'utf8') })
      drawPages(
        PAGES.filter((p) => p.path !== '/'),
        (page, html) => this.emitFile({ type: 'asset', fileName: page.path.slice(1) + '.html', source: html }),
        beacon,
      )
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(PAGES) })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() })
    },
  }
}
