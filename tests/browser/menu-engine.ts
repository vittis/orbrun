import { existsSync, readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { test } from './fixtures'

type DemoEvidence = { starts: number; live: number; commands: number; outputs: number; combat: number; opens: string[]; firstMapMs: number | null }

/** Real local Crawl artifacts only. Ordinary CI explicitly skips this separately provisioned lane. */
export function menuEngineCheck(production: boolean) {
  const available = existsSync(new URL(production ? '../../apps/orbrun/dist/menu-engine/manifest.json' : '../../engine/dist/menu/engine.json', import.meta.url))
  if (process.env.REQUIRE_MENU_ENGINE === '1' && !available) throw new Error('REQUIRE_MENU_ENGINE=1 requires a built menu engine')
  test('live menu engine fights, sleeps, restarts and avoids saves under CSP', async ({ page }) => {
    test.skip(!available, 'Build the pinned menu engine with node engine/prepare-menu.mjs; no real-engine coverage without it')
    const base = production ? 'http://127.0.0.1:5287' : 'http://127.0.0.1:5286'
    const csp = /Content-Security-Policy: (.+)/.exec(readFileSync(new URL('../../apps/orbrun/public/_headers', import.meta.url), 'utf8'))![1]
    // Preview does not apply Cloudflare headers; verify both document and module worker policies.
    await page.route(base + '/**', async route => {
      if (!['document', 'script'].includes(route.request().resourceType())) return route.continue()
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
    })
    await page.routeWebSocket(/^wss:\/\//, socket => socket.close())
    await page.addInitScript(() => {
      const evidence: DemoEvidence = { starts: 0, live: 0, commands: 0, outputs: 0, combat: 0, opens: [], firstMapMs: null }
      Object.assign(window, { __menuEvidence: evidence })
      const originalOpen = indexedDB.open.bind(indexedDB)
      indexedDB.open = (...args) => { evidence.opens.push(args[0]); return originalOpen(...args) }
      const Original = Worker
      window.Worker = class extends Original {
        private demo = false
        private stopped = false
        private started = 0
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options)
          this.addEventListener('message', event => {
            if (!this.demo || event.data.type !== 'output') return
            evidence.outputs++
            for (const line of (event.data.text as string).split('\n')) {
              if (!line || line.startsWith('*')) continue
              const message = JSON.parse(line)
              if (message.msg === 'map' && message.cells?.length && evidence.firstMapMs === null) evidence.firstMapMs = performance.now() - this.started
              if (message.msg === 'msgs' && /You (?:hit|slash|cleave|kill|miss)|(?:hits|bites|misses) you/.test(JSON.stringify(message.messages))) evidence.combat++
            }
          })
        }
        postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
          const m = message as { type: string; persistent?: boolean }
          if (m.type === 'start' && m.persistent === false) { this.demo = true; this.started = performance.now(); evidence.starts++; evidence.live++ }
          if (this.demo && (m.type === 'keys' || m.type === 'control')) evidence.commands++
          if (Array.isArray(options)) super.postMessage(message, options)
          else super.postMessage(message, options)
        }
        terminate() { if (this.demo && !this.stopped) { this.stopped = true; evidence.live-- }; super.terminate() }
      }
    })
    const evidence = () => page.evaluate(() => (window as unknown as { __menuEvidence: DemoEvidence }).__menuEvidence)
    await page.goto(base)
    const canvas = page.locator('.menu-backdrop canvas')
    await expect(canvas).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await evidence()).combat, { timeout: 30_000 }).toBeGreaterThan(0)
    const shine = page.locator('.crawl-title')
    const park = async () => {
      await page.waitForTimeout(200) // Allow the single in-flight engine response to settle.
      const before = await evidence()
      const pixels = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
      await page.waitForTimeout(1000) // A real quiet window proves both renderer and command clock sleep.
      const after = await evidence()
      expect(after.commands).toBe(before.commands)
      expect(after.outputs).toBe(before.outputs)
      expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(pixels)
      if (await shine.count()) expect(await shine.evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none')
    }
    await page.locator('[data-focus="about"]').click(); await park()
    await page.keyboard.press('Escape')
    const resumed = (await evidence()).commands
    await expect.poll(async () => (await evidence()).commands).toBeGreaterThan(resumed)
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
    await park()
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(canvas).toBeHidden()
    await expect.poll(async () => (await evidence()).live).toBe(0)
    const before = await evidence()
    await page.waitForTimeout(1000); expect((await evidence()).starts).toBe(before.starts)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(canvas).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await evidence()).starts).toBeGreaterThan(before.starts)
    expect((await evidence()).live).toBe(1)
    expect((await evidence()).opens).toEqual([])
    await page.screenshot({ path: `test-results/menu-live-${production ? 'production' : 'development'}.png` })
    await test.info().attach('menu-engine-evidence', { body: JSON.stringify(await evidence()), contentType: 'application/json' })
    // A narrow menu stays usable while the same engine/renderer resizes.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { name: 'Polished Crawl' })).toBeVisible()
    await page.locator('[data-focus="settings"]').click()
    await park()
  })
}
