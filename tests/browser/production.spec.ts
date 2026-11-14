import { expect } from '@playwright/test'
import { test } from './fixtures'

test('production shell has Dungeon scenery and only bundled online play', async ({ page }) => {
  // Keep the acceptance lane deterministic and independent of public servers.
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.goto('http://127.0.0.1:5287/')
  await expect(page.locator('canvas.room.in')).toHaveCount(1)
  await expect(page.getByText('An unofficial 2.5D client for Dungeon Crawl Stone Soup.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Settings/ }).click()
  await expect(page.getByText('Dungeon tilt', { exact: false })).toBeVisible()
  await expect(page.getByText('Projection', { exact: true })).toHaveCount(0)
  await page.goto('http://127.0.0.1:5287/')
  await page.getByRole('button', { name: /Play/ }).click()
  await expect(page.getByRole('button', { name: /CDI/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Offline|Custom server|Add server/i })).toHaveCount(0)
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
