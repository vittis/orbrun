import { menuEngineCheck } from './menu-engine'
import { expect } from '@playwright/test'
import { test } from './fixtures'

test('production shell loads local fonts under CSP and offers only bundled online play', async ({ page }) => {
  const { readFileSync } = await import('node:fs')
  const csp = /Content-Security-Policy: (.+)/.exec(readFileSync(new URL('../../apps/orbrun/public/_headers', import.meta.url), 'utf8'))![1]
  await page.route('http://127.0.0.1:5287/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
  await page.routeWebSocket(/wss?:\/\//, socket => socket.send(JSON.stringify({ msg: 'lobby_complete' })))
  await page.goto('http://127.0.0.1:5287/')
  await expect(page.getByRole('heading', { name: 'Polished Crawl' })).toBeVisible()
  await expect(page.locator('.menu-backdrop')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => ['700 30px "Barlow Condensed"', '400 15px "IBM Plex Sans"', '500 18px "IBM Plex Mono"'].every(font => document.fonts.check(font)))).toBe(true)
  await expect(page.getByRole('combobox', { name: 'Server' }).locator('option')).not.toContainText(['Offline'])
  await page.locator('[data-focus="accounts"]').click()
  await page.getByRole('button', { name: /Add an account/ }).click()
  await expect(page.getByRole('button', { name: /CDI/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Offline|Custom server|Add a server/i })).toHaveCount(0)
  for (const [path, heading] of [['/about', 'About & credits'], ['/about/new', 'What’s new'], ['/whats-new', 'What’s new']]) {
    await page.goto('http://127.0.0.1:5287' + path)
    await expect(page.getByRole('dialog', { name: heading, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.polished-home')).toBeVisible()
  }
})

test('production audio worker decodes an OSP-format pack under the shipped CSP', async ({ page }) => {
  const { audioArchive, audioStarts, observeAudio } = await import('./audio-fixture')
  const { readFileSync } = await import('node:fs')
  const csp = /Content-Security-Policy: (.+)/.exec(readFileSync(new URL('../../apps/orbrun/public/_headers', import.meta.url), 'utf8'))![1]
  // Vite preview does not serve Cloudflare's _headers file; apply its exact policy to the document.
  await page.route('http://127.0.0.1:5287/settings/audio', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
  await observeAudio(page)
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.route('https://osp.nemelex.cards/build/latest.zip', route => route.fulfill({ body: audioArchive(), contentType: 'application/zip', headers: { 'access-control-allow-origin': '*' } }))
  await page.goto('http://127.0.0.1:5287/settings/audio')
  await expect(page.locator('.audio-status')).toContainText('Download CNC')
  await page.getByRole('button', { name: 'Sound effects next', exact: true }).click()
  await page.getByText('Download / refresh OSP', { exact: true }).click()
  await expect(page.locator('.audio-status')).toContainText('3 sound rules ready')
  await page.getByText('Test sound', { exact: true }).click()
  await expect.poll(() => audioStarts(page)).toBe(1)
})

menuEngineCheck(true)

test('menu entrance appears during a slow engine load and yields to the live scene', async ({ page }) => {
  const { existsSync } = await import('node:fs')
  test.skip(!existsSync(new URL('../../apps/orbrun/dist/menu-engine/manifest.json', import.meta.url)), 'Requires the pinned menu engine')
  await page.addInitScript(() => {
    const w = window as unknown as { loadingWorkers: number }
    w.loadingWorkers = 0
    const Original = Worker
    window.Worker = class extends Original {
      private stopped = false
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); w.loadingWorkers++ }
      terminate() { if (!this.stopped) { this.stopped = true; w.loadingWorkers-- }; super.terminate() }
    }
  })
  const workers = () => page.evaluate(() => (window as unknown as { loadingWorkers: number }).loadingWorkers)
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  await page.route('**/menu-engine/gamedata/**/enums.js', async route => { await waiting; await route.continue() })
  await page.routeWebSocket(/^wss:\/\//, socket => socket.send(JSON.stringify({ msg: 'lobby_complete' })))
  await page.goto('http://127.0.0.1:5287/')
  await expect(page.locator('.menu-entrance')).toBeVisible()
  await expect(page.locator('.menu-loading')).toBeVisible()
  await expect.poll(workers).toBe(1) // The engine boots before the deliberately delayed artwork.
  expect(await page.locator('.menu-backdrop').evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none')
  await page.screenshot({ path: 'test-results/menu-loading-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/menu-loading-narrow.png' })
  await page.locator('[data-focus="about"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(workers).toBe(0)
  release()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menu-backdrop canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.menu-entrance')).toBeHidden()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.menu-entrance')).toBeVisible()
  await expect(page.locator('.menu-loading')).toBeHidden()
  await expect.poll(workers).toBe(0)
})

test('repeat visits render live gameplay from cached assets without a dark overlay', async ({ page }) => {
  const { existsSync } = await import('node:fs')
  test.skip(!existsSync(new URL('../../apps/orbrun/dist/menu-engine/manifest.json', import.meta.url)), 'Requires the pinned menu engine')
  await page.routeWebSocket(/^wss:\/\//, socket => socket.close())
  await page.goto('http://127.0.0.1:5287/')
  await expect(page.locator('.menu-backdrop canvas')).toBeVisible({ timeout: 60_000 })
  const coldMs = await page.evaluate(() => performance.now())
  await expect.poll(() => page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('orbrun-menu-assets-v1-'))
    return name ? (await (await caches.open(name)).keys()).length : 0
  })).toBe(20)
  const networkMisses: string[] = []
  await page.route('**/menu-engine/**', route => {
    // ES-module imports use the browser's own HTTP/code cache. All large data stays in our asset cache.
    if (route.request().url().endsWith('/crawl.js')) return route.continue()
    networkMisses.push(route.request().url())
    return route.abort()
  })
  await page.reload()
  await expect(page.locator('.menu-backdrop canvas')).toBeVisible({ timeout: 60_000 })
  const warmMs = await page.evaluate(() => performance.now())
  expect(networkMisses).toEqual([])
  expect(await page.locator('.polished-shell').evaluate(el => getComputedStyle(el, '::before').content)).toBe('none')
  await page.screenshot({ path: 'test-results/menu-raw-gameplay.png' })
  await test.info().attach('repeat-visit-timing', { body: JSON.stringify({ coldMs, warmMs }), contentType: 'application/json' })
})
