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
