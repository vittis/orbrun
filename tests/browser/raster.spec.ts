import { expect } from '@playwright/test'
import { test, result } from './fixtures'

test('spell entrances bloom, settle, sleep and respect visibility/Still', async ({ page }) => {
  await page.goto('/testbed/spawn-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.checks).toBe(32)
  expect(report.failures, JSON.stringify(report)).toEqual([])
})

const fullChecks = { tiles: 342, markers: 216, surfaces: 28, movement: 324, depth: 162, visibility: 96, arrival: 96, coherence: 378, corridors: 2430, melee: 576 }
// A smoke run still exercises every rendering concern; the profile reduces combinations.
const smokeChecks = { tiles: 12, markers: 16, surfaces: 14, movement: 36, depth: 12, visibility: 36, arrival: 24, coherence: 28, corridors: 72, melee: 64 }
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

