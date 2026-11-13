import { defineConfig } from 'vitest/config'
import { availableParallelism } from 'node:os'

export default defineConfig({
  test: {
    // Previously benchmarked: bounded isolated threads beat process pools here.
    pool: 'threads',
    minWorkers: 1,
    maxWorkers: Math.min(4, availableParallelism()),
    isolate: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'tools/testing/test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'apps/*/test/e2e/**', 'apps/orbrun/test/deploy-guard.test.ts'],
        },
      },
      {
        extends: true,
        test: { name: 'deploy', include: ['apps/orbrun/test/deploy-guard.test.ts'] },
      },
    ],
  },
})
