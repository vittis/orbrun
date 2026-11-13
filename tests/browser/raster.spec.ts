import { expect } from '@playwright/test'
import { test, result } from './fixtures'

test('native spell tiles fade without deformation, settle and respect visibility/Still', async ({ page }) => {
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

const fullChecks = { tiles: 350, markers: 216, surfaces: 28, movement: 756, depth: 162, visibility: 96, arrival: 96, coherence: 432, corridors: 2430 }
// A smoke run still exercises every rendering concern; the profile reduces combinations.
const smokeChecks = { tiles: 20, markers: 16, surfaces: 14, movement: 84, depth: 12, visibility: 36, arrival: 24, coherence: 32, corridors: 72 }
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



test('shaded impact art includes subtle miss and zero-damage feedback with complete expiry', async ({ page }) => {
  await page.goto('/testbed/impact-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(76)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})
