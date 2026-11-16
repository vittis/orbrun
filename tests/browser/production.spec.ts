import { menuReplayCheck } from './menu-replay'
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

menuReplayCheck(true)

test('menu entrance handles slow recordings, cancellation and loading at desktop and narrow sizes', async ({ page }) => {
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  await page.route('**/menu/clips/**', async route => { await waiting; await route.continue() })
  await page.routeWebSocket(/^wss:\/\//, socket => socket.close())
  await page.goto('http://127.0.0.1:5287/')
  await expect(page.locator('.menu-entrance')).toBeVisible()
  await expect(page.locator('.menu-loading')).toBeVisible()
  await page.screenshot({ path: 'test-results/menu-loading-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/menu-loading-narrow.png' })
  await page.locator('[data-focus="about"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  release()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menu-backdrop canvas')).toBeVisible()
  await expect(page.locator('.menu-entrance')).toBeHidden()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.menu-entrance')).toBeVisible()
  await expect(page.locator('.menu-loading')).toBeHidden()
})
