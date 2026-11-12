import { defineConfig } from '@playwright/test'

// Dedicated, strict ports prevent accidentally testing another checkout.
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser.json' }]],
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
    {
      command: 'npm run dev -w apps/orbrun -- --host 127.0.0.1 --port 5286 --strictPort',
      url: 'http://127.0.0.1:5286',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run preview -w apps/orbrun -- --host 127.0.0.1 --port 5287 --strictPort',
      url: 'http://127.0.0.1:5287',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
