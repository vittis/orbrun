import { test as base, expect, type Page } from '@playwright/test'

// Every test gets a fresh browser context. Fixture exceptions must fail the gate,
// including errors that happen after a fixture writes its initial status.
const test = base.extend<{ pageErrors: void }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await use()
    expect(errors, 'uncaught browser errors').toEqual([])
  }, { auto: true }],
})

async function result(page: Page) {
  const text = await page.locator('#result').innerText()
  return text.trim() ? JSON.parse(text) : {}
}

const fullChecks = { tiles: 342, markers: 216, surfaces: 28, movement: 324, depth: 162, visibility: 96, arrival: 96, coherence: 378, corridors: 2430 }
for (const [lane, checks] of Object.entries(fullChecks)) {
  test(`full raster: ${lane}`, async ({ page }) => {
    await page.goto(`/testbed/dungeon-checks.html?lane=${lane}`)
    await expect.poll(async () => {
      try { return (await result(page)).status } catch { return 'loading' }
    }, { timeout: 75_000 }).toMatch(/complete|error/)
    const report = await result(page)
    expect(report.status, JSON.stringify(report)).toBe('complete')
    expect(report.profile).toBe('full')
    expect(report.checks, 'complete full matrix').toBe(checks)
    expect(report.failures, JSON.stringify(report)).toEqual([])
    expect(report.passed).toBe(report.checks)
  })
}

test('Dungeon and flat atmosphere, Still, and impact', async ({ page }) => {
  await page.goto('/testbed/living-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }, { timeout: 75_000 }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.profile).toBe('full')
  expect(report.checks).toBe(12)
  expect(report.passed).toBe(report.checks)
  expect(report.failures).toEqual([])
})

test('real GameScreen follows native reduced motion, Still, and explicit On', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/testbed/live-animation.html?native-motion=1&motion=auto')
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(2)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(async () => (await result(page)).reduced).toBe(true)
  await expect.poll(async () => (await result(page)).animating).toBe(false)
  const reducedFrames = (await result(page)).frames
  // Intentional quiet observation window: an animation loop must remain asleep.
  await page.waitForTimeout(350)
  expect((await result(page)).frames).toBe(reducedFrames)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('on')
  await expect.poll(async () => (await result(page)).animating).toBe(true)
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(2)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('still')
  await expect.poll(async () => (await result(page)).animating).toBe(false)
  const stillFrames = (await result(page)).frames
  await page.waitForTimeout(350)
  expect((await result(page)).frames).toBe(stillFrames)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('auto')
  await expect.poll(async () => (await result(page)).animating).toBe(false)
  const beforeResume = (await result(page)).frames
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(async () => (await result(page)).reduced).toBe(false)
  await expect.poll(async () => (await result(page)).animating).toBe(true)
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(beforeResume + 2)
})

for (const touch of [false, true]) {
  test.describe(touch ? 'narrow touch' : 'narrow mouse', () => {
    test.use({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: touch })
    test('readable HUD and repeated map/overview restoration', async ({ page }) => {
      await page.goto('/testbed/map-lifecycle.html')
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(touch)
      expect(await page.evaluate(() => screen.width)).toBe(390)
      const layout = await page.locator('.stats').evaluate(el => {
        const rect = el.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth }
      })
      expect(layout.left).toBeGreaterThanOrEqual(0)
      expect(layout.right).toBeLessThanOrEqual(layout.viewport)
      expect(layout.width).toBeGreaterThan(280)
      const overflow = await page.locator('.stats .line').evaluateAll(lines => lines
        .filter(line => line.textContent?.trim())
        .map(line => ({ text: line.textContent, width: line.clientWidth, content: line.scrollWidth })))
      expect(overflow.length).toBeGreaterThan(3)
      expect(overflow.filter(line => line.content > line.width + 1), 'clipped stats text').toEqual([])
      await page.getByRole('button', { name: 'Open level map', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render2d')
      await expect.poll(async () => (await result(page)).cursor).toMatchObject({ x: 13, y: 7 })
      await page.getByRole('button', { name: 'Change tilt and zoom', exact: true }).click()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Open overview', exact: true }).click()
      await expect(page.getByText('Dungeon overview', { exact: true })).toBeVisible()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      expect(await result(page)).toMatchObject({ tilt: 65, zoom: 1.2, cursor: null, canvases: 1, appliedDungeonOptions: { tilt: 65, zoom: 1.2 } })
      await page.setViewportSize({ width: 640, height: 720 })
      await page.getByRole('button', { name: 'Open level map', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      const state = await result(page)
      expect(state.created - state.destroyed).toBe(1)
      expect(state.canvases).toBe(1)
      await page.getByRole('button', { name: 'Target creature', exact: true }).click()
      await expect.poll(async () => (await result(page)).cursor).toMatchObject({ x: 11, y: 3 })
      await page.locator('canvas.view').press('ArrowRight')
      await expect.poll(async () => JSON.stringify((await result(page)).sent)).toContain('"l"')
    })
  })
}

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
