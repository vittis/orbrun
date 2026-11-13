import { expect } from '@playwright/test'
import { test, result } from './fixtures'

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
  // Applying Still queues one static redraw; observe sleep after that paint.
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(0)
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
  // Removing floating text must leave confirmed world effects connected to GameScreen.
  const impacts = (await result(page)).impacts
  await page.getByRole('button', { name: 'Trigger local hit', exact: true }).click()
  await expect.poll(async () => (await result(page)).impacts).toBeGreaterThan(impacts)
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

