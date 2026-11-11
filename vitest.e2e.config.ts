import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
// The e2e harness (apps/orbrun/test/e2e): the app's own client on crawl built to WebAssembly
// (engine/build.sh). Normal runs skip unavailable engines; the engine CI lane
// uses REQUIRE_ENGINE=1 to require stable, the channel startLive defaults to.
if (process.env.REQUIRE_ENGINE === '1' && !existsSync(new URL('./engine/dist/stable/engine.json', import.meta.url))) {
  throw new Error('REQUIRE_ENGINE=1 needs engine/dist/stable/engine.json; build the stable engine before running this test lane.')
}
export default defineConfig({
  test: {
    include: ['apps/orbrun/test/e2e/**/*.test.ts'],
    testTimeout: 600_000,
  },
})
