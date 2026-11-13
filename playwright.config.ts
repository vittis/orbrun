import { defineConfig } from '@playwright/test'
import { availableParallelism } from 'node:os'

// The default UI gate needs only Vite, no production build or preview server.
const suite = process.env.BROWSER_SUITE ?? 'smoke'
if (!['smoke', 'full', 'production', 'release'].includes(suite)) throw new Error(`Unknown BROWSER_SUITE: ${suite}`)
const production = suite === 'production' || suite === 'release'
const development = suite !== 'production'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  // Two workers reduced the measured smoke gate from 20s to 12s; keep Canvas contention bounded.
  workers: Math.min(2, availableParallelism()),
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser.json' }]],
  projects: [{
    name: suite,
    metadata: { profile: suite === 'smoke' ? 'smoke' : 'full' },
    testMatch: [
      ...(development ? ['**/raster.spec.ts', '**/interaction.spec.ts'] : []),
      ...(production ? ['**/production.spec.ts'] : []),
    ],
  }],
  use: {
    browserName: 'chromium',
    actionTimeout: 5_000,
    navigationTimeout: 20_000,
    baseURL: 'http://127.0.0.1:5286',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    ...(development ? [{
      command: 'npm run dev -w apps/orbrun -- --host 127.0.0.1 --port 5286 --strictPort',
      url: 'http://127.0.0.1:5286',
      reuseExistingServer: false,
      timeout: 30_000,
    }] : []),
    ...(production ? [{
      command: 'npm run preview -w apps/orbrun -- --host 127.0.0.1 --port 5287 --strictPort',
      url: 'http://127.0.0.1:5287',
      reuseExistingServer: false,
      timeout: 30_000,
    }] : []),
  ],
})
