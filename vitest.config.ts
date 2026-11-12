import { defineConfig } from 'vitest/config'
import { availableParallelism } from 'node:os'
export default defineConfig({
  test: {
    // Use both cores on small CI runners; bound contention on larger machines.
    // Isolated threads outperformed equal-sized process pools in repeated runs.
    pool: 'threads',
    minWorkers: 1,
    maxWorkers: Math.min(4, availableParallelism()),
    isolate: true,
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // the e2e harness plays crawl itself: `npm run e2e` (vitest.e2e.config.ts)
    exclude: ['**/node_modules/**', 'apps/*/test/e2e/**'],
  },
})
