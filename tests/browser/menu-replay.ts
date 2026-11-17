import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { test } from './fixtures'

type Evidence = { workers: number; opens: string[]; draws: number }

export function menuReplayCheck(production: boolean) {
  test('recorded menu renders without an engine, sleeps when covered/hidden and respects reduced motion', async ({ page }) => {
    const base = production ? 'http://127.0.0.1:5287' : 'http://127.0.0.1:5286'
    const csp = /Content-Security-Policy: (.+)/.exec(readFileSync(new URL('../../apps/orbrun/public/_headers', import.meta.url), 'utf8'))![1]
    await page.route(base + '/**', async route => {
      if (route.request().resourceType() !== 'document') return route.continue()
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
    })
    const forbidden: string[] = []
    page.on('request', request => { if (/\/menu-engine\/|\/engine\/|\.wasm(?:$|\?)/.test(request.url())) forbidden.push(request.url()) })
    await page.routeWebSocket(/^wss:\/\//, socket => {
      socket.onMessage(message => {
        const msg = JSON.parse(String(message)).msg
        if (['watch', 'play', 'key', 'input', 'chat'].includes(msg)) forbidden.push(msg)
      })
      socket.send(JSON.stringify({ msg: 'lobby_complete' }))
    })
    await page.addInitScript(() => {
      const evidence: Evidence = { workers: 0, opens: [], draws: 0 }
      Object.assign(window, { __menuEvidence: evidence })
      // Replay works even where the retired JSPI engine was unsupported.
      Object.defineProperty(WebAssembly, 'Suspending', { configurable: true, value: undefined })
      const originalOpen = indexedDB.open.bind(indexedDB)
      indexedDB.open = (...args) => { evidence.opens.push(args[0]); return originalOpen(...args) }
      const Original = Worker
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) { super(url, options); evidence.workers++ }
      }
      const draw = CanvasRenderingContext2D.prototype.drawImage
      CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
        if (this.canvas.matches?.('.menu-backdrop canvas')) evidence.draws++
        return Reflect.apply(draw, this, args)
      }
    })
    const evidence = () => page.evaluate(() => (window as unknown as { __menuEvidence: Evidence }).__menuEvidence)
    await page.goto(base)
    const canvas = page.locator('.menu-backdrop canvas')
    await expect(canvas).toBeVisible()
    const pixels = () => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
    const initial = await pixels()
    await expect.poll(pixels).not.toBe(initial)
    const park = async () => {
      const before = await evidence(), beforePixels = await pixels()
      await page.waitForTimeout(1000) // Real observation: neither the renderer nor playback wakes while parked.
      expect((await evidence()).draws).toBe(before.draws)
      expect(await pixels()).toBe(beforePixels)
    }
    await page.locator('[data-focus="about"]').click(); await park()
    await page.keyboard.press('Escape')
    const resumed = (await evidence()).draws
    await expect.poll(async () => (await evidence()).draws).toBeGreaterThan(resumed)
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
    await park()
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(canvas).toBeHidden(); await expect(page.locator('.menu-entrance')).toBeVisible()
    await park()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(canvas).toBeVisible()
    await page.screenshot({ path: `test-results/menu-replay-${production ? 'production' : 'development'}-desktop.png` })
    const beforeResize = (await evidence()).draws
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(async () => (await evidence()).draws).toBeGreaterThan(beforeResize)
    await page.screenshot({ path: `test-results/menu-replay-${production ? 'production' : 'development'}-narrow.png` })
    await expect(page.getByRole('heading', { name: 'Polished Crawl' })).toBeVisible()
    expect((await evidence()).workers).toBe(0)
    expect((await evidence()).opens).toEqual([])
    expect(forbidden).toEqual([])
    await page.locator('[data-focus="settings"]').click(); await park()
  })
}
