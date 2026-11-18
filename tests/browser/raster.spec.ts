import { expect } from '@playwright/test'
import type { Render25d } from '@orbrun/render-2.5d'
import type { Scene } from '@orbrun/scene'
import { test, result } from './fixtures'

test('Shoals water moves without outlining the native depth transition', async ({ page }) => {
  await page.goto('/testbed/dungeon.html?scene=shoals')
  await page.waitForFunction(() => '__ready' in window)
  const samples = await page.evaluate(() => {
    const { renderer, scene, canvas } = window as unknown as { renderer: Render25d; scene: Scene; canvas: HTMLCanvasElement }
    renderer.setOptions({ center: { x: 0, y: 25.5 }, zoom: 3, movement: false })
    const ctx = canvas.getContext('2d')!
    function sample(time: number) {
      renderer.render(time)
      // The shallow tile's southern overlay meets the deep tile's own artwork here.
      const { x, y } = renderer.project(0, 25.5)
      const center = renderer.project(0, 26)
      return {
        edge: ctx.getImageData(Math.round(x) - 12, Math.round(y) - 1, 24, 2).data,
        interior: ctx.getImageData(Math.round(x) - 8, Math.round(center.y) - 8, 16, 16).data,
      }
    }
    const first = sample(5), second = sample(16)
    // Render the same atlas layers directly to obtain an independent reference.
    for (const cell of scene.cells.values()) cell.flags.water = false
    renderer.setScene({ ...scene, revision: scene.revision + 1 })
    const reference = sample(5).edge
    return {
      edgeError: Math.max(...reference.map((value, i) =>
        Math.max(Math.abs(value - first.edge[i]), Math.abs(value - second.edge[i])))),
      moving: first.interior.some((value, i) => Math.abs(value - second.interior[i]) > 2),
    }
  })
  expect(samples.edgeError).toBeLessThanOrEqual(1)
  expect(samples.moving).toBe(true)
})

test('LOS shading joins straight and diagonal terrain boundaries in a static frame', async ({ page }) => {
  await page.goto('/testbed/los-boundary-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(32)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

test('ruined columns and similar wall-category props keep floor-supported silhouettes', async ({ page }) => {
  await page.goto('/testbed/scenery-terrain-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(64)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

test('soft circular stars and subtle curls can be disabled while preserving exploration edges', async ({ page }) => {
  await page.goto('/testbed/fog-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(111)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

test('elemental splatters stay visible at tile scale and lightning has bright zigzag cores', async ({ page }) => {
  await page.goto('/testbed/elemental-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(26)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

test('native spell tiles fade without deformation, settle and respect visibility and renderer pauses', async ({ page }) => {
  await page.goto('/testbed/spawn-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(80)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

test('spell glyph and artwork updates preserve terrain with lighting and VFX enabled', async ({ page }) => {
  await page.goto('/testbed/spell-terrain-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }, { timeout: 75_000 }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(240)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

const fullChecks = { tiles: 350, markers: 216, surfaces: 28, movement: 1134, depth: 162, visibility: 96, arrival: 96, coherence: 648, corridors: 2430 }
// A smoke run still exercises every rendering concern; the profile reduces combinations.
const smokeChecks = { tiles: 20, markers: 16, surfaces: 14, movement: 126, depth: 12, visibility: 36, arrival: 24, coherence: 48, corridors: 72 }
for (const lane of Object.keys(fullChecks) as (keyof typeof fullChecks)[]) {
  test(`raster: ${lane}`, async ({ page }, testInfo) => {
    const profile = testInfo.project.metadata.profile as 'smoke' | 'full'
    const checks = (profile === 'full' ? fullChecks : smokeChecks)[lane]
    await page.goto(`/testbed/dungeon-checks.html?lane=${lane}&profile=${profile}`)
    await expect.poll(async () => {
      try { return (await result(page)).status } catch { return 'loading' }
    }, { timeout: 75_000 }).toMatch(/complete|error/)
    const report = await result(page)
    expect(report.status, JSON.stringify(report)).toBe('complete')
    expect(report.profile).toBe(profile)
    expect(report.checks, `complete ${profile} matrix`).toBe(checks)
    expect(report.failures, JSON.stringify(report)).toEqual([])
    expect(report.passed).toBe(report.checks)
  })
}
