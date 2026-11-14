# Validation baseline

Measured 2026-11-12 on macOS arm64, Node 24.11.1/npm 11.6.2, Vitest 3.2.7, Playwright 1.65.0. The fast-iteration measurements below predate the subsequent combat-popup removal. At the time of that measurement the runtime matched deployed 0.3.68; later working-tree changes are recorded separately below. The prior release's complete evidence is in [0.3.68](releases/0.3.68.md).

## Measured iteration speed

| Workflow | Before | After | Interpretation |
|---|---:|---:|---|
| Ordinary completion (`npm run verify`) | 77.96s | 11.69s / 11.43s | About 85% less waiting (6.7× faster); now incremental types + retained units |
| Focused settings edit (`test:changed -- settings.test.ts`) | — | 0.50s | 44 affected tests, including process startup |
| Routine browser test phase | 58.6s full matrix | 11.9s / 12.0s smoke | About 80% faster; intentional representative profile |
| Complete release gate | 77.96s | 51.59s | About 34% faster; full raster + production acceptance retained |

Browser smoke command wall times: one worker 20.01s; two workers 12.29s and 12.37s. Two workers are now the bounded default (one on a single-core host). The release browser phase passed in 31.9s versus 58.6s previously. Isolation and zero retries remain enabled.

The incremental scene test file fell from 5,162ms to 644–745ms by replaying the whole recording once with alternating single/coalesced flushes, rather than replaying three entire cadence matrices. The movement curve file fell from 1,081ms to 19ms by sampling meaningful endpoints/interiors and both sides of ramp/brake joins instead of 999 interior points per curve. These per-file timings vary with worker scheduling.

[Machine-readable measurements](verification-performance.json) record command scope, counts and wall time. Dependencies/browser were already installed; caches were warm. Measurements were sequential, with no concurrent full build/test workloads. The old gate has one fresh sample; the new fast gate and two-worker smoke each have two. These are local measurements, not Linux CI timing promises. No wall-clock assertions or profiling framework were added to the suite.

## Final verification

- `npm run verify`: 2,262 passing unit cases, two optional-engine skips, 135 passing files/one skipped. Both timed runs passed. Incremental TypeScript includes app, browser/config and verification-routing code.
- `npm run verify:release`: forced TypeScript, **2,277 passing cases** across unit and deploy projects (two optional-engine skips), one production build, **14 passing browser tests**, all **4,072 full raster assertions** and 12 atmosphere assertions. Real-Git deployment freshness/cleanliness tests are included (15 cases).
- `npm run verify:browser`: **13 passing browser tests**, **250 raster assertions** across all nine concerns, plus 12 atmosphere assertions, native reduced motion/Still/On and narrow mouse/touch map/HUD regressions. Both one-worker and repeated two-worker runs passed.
- CI routing regression tests pass; workflow YAML parses; suite listings select 13 dev checks or one production check as intended. CI changes have been verified locally, not executed on GitHub during this pass.
- Optional engine acceptance: **41 cases in nine files skipped**, because engine artifacts are absent. The manual recorder is no longer collected; assertion-free probe/help dumps were removed.
- No changes to shipped app code, renderer algorithms or artwork. The rebuilt main bundle still has SHA-256 `8b35b82864a7b45bca4c764314f2b4abe054af7c25821de4cf4c6d81270cc8cb`, matching the deployed 0.3.68 bundle.

## Deliberate coverage tradeoffs

Removed 24 redundant unit cases (including duplicate storage migrations/normalization, cosmetic label/layout expectations, repeated grounded-species inputs and duplicate full replays); added five CI-routing regressions. Real-Git deployment tests moved out of the ordinary gate, not out of release verification. Motion tests now sample behavior boundaries; the recording replay no longer asserts every possible batching of every message.

The smoke matrix samples fractional/high DPI, both filtering paths, floors/walls/sprites, picking, occlusion, movement, projectile coverage and camera extremes; it does not claim exhaustive parameter coverage. Full matrices and independent authored-art oracles remain in render/release gates. The browser text-overflow assertion that caught Linux font clipping is retained unchanged.

The fast gate deliberately omits builds and browsers. CSS/assets/readFile fixtures/configuration can escape import-based changed-test selection. Follow [AGENTS.md](../AGENTS.md) and [RUNBOOK.md](RUNBOOK.md) to select broader checks, and use release verification before publication. Browser acceptance remains deterministic and local; it does not establish physical devices, authenticated play or provisioned offline-engine behavior. No deployment was made during this verification-only pass.

## Combat popup removal (subsequent working-tree change)

Removed the floating-text renderer, CSS, SVG icon factory, Barlow font/license, setting/default, lifecycle/frame hooks, preview overlays, dedicated popup tests, and the two offline-engine damage-number patches. Shared feedback now uses `CombatEvent` without display labels, layout coordinates above actors or popup delay fields. Confirmed melee, hit, spell/healing/status and death effects remain; legacy saved settings are ignored and omitted on the next settings write without touching accounts/saves. Historical release notes remain historical records.

Validation: `npm run verify` passed **2,222 unit cases** (two optional-engine skips), with incremental types; full `verify:render` passed **13 browser cases**, all **4,072 raster assertions** and 12 atmosphere assertions. Production build/preview passed separately. The existing native-motion browser regression now also triggers a local hit through the real GameScreen and checks that a world impact still occurs; its focused run passed. Final healing-strength preservation passed typechecking and 100 affected combat/spell cases. Production output contains no popup renderer/styles or Barlow assets.

`REQUIRE_ENGINE=1 npm run e2e` cannot run without `engine/dist/stable/engine.json`; the removed patches have not been validated in a rebuilt WASM engine. The content-based engine recipe automatically changes when patches are removed, so subsequent engine builds will use the new recipe. No deployment was performed.

## Runtime responsiveness pass — 2026-11-14

Compared with `cfb1922` (0.3.118), using local fixtures on macOS arm64, Node 24.11.1 and headless Chromium 158.0.8127.18 at 1280×720. [Machine-readable measurements](responsiveness-performance.json) include sample counts, tail timings and limitations.

| Workload | Before | After |
|---|---:|---:|
| Moving room, median draw time | 7.0 ms | 5.2 ms |
| Moving room with unexplored fog, median draw time | 8.4 ms | 6.5 ms |
| Confirmed hits every 100 ms with fog, median draw time | 7.3 ms | 5.3 ms |
| 64 anonymous items, median movement observation | 0.169 ms | 0.054 ms |
| 256 anonymous items, median movement observation | 2.195 ms | 0.204 ms |
| 625 anonymous items, median movement observation | 12.496 ms | 0.540 ms |

The browser scenarios each ran for six seconds after 1.5 seconds of warm-up; the existing profiler reports its trailing four-second window. Current code ran before the baseline, sequentially without builds/tests competing for the CPU. Movement measurements use seven alternating A/B samples of 200 observations after warm-up. These are descriptive local measurements, not CI thresholds. The item counts are stress cases, not a claim about typical visible crowds.

Changes:

- Input resolves newly received server state before keyboard/controller/touch routing, including pending scene composition and menu focus. A real-browser regression delivers replies and inputs in one task, confirms `--more--` immediately, selects a newly opened menu, and sends eight movement commands without an intervening paint. Disabling the fix reproduced missed controller/touch confirmations; enabling it passed. Commands remain server-authoritative and do not wait for animations.
- Held directional and button repeats retain their original cadence across uneven display frames. Missed repeats are discarded after stalls. Deterministic tests cover controller buttons, d-pad and touch arrows, release and stalled frames.
- Anonymous movement matching uses indexed stationary copies and signature counts instead of repeated full actor scans. Conservative identity matching, stacked copies, visibility, level changes, camera curves and Still behavior remain covered.
- Lighting skips samples outside all light surfaces, indexes actor occupancy, and retains a bounded pool of four mask canvases to avoid repeated resize allocation. Sampling uses the source footprint, including displaced sprites, and clears stale bounds/resources. Fog avoids noise evaluation where the exploration mask is mathematically fully opaque; black RGB pixels remain in reused ImageData.

Reproduce outside the default test suite:

```sh
npm run dev -w apps/orbrun -- --host 127.0.0.1 --port 5296 --strictPort
# In a second terminal, with no other benchmark/test workload running:
node tools/perf/responsiveness.mjs
# Optional CPU call stacks:
PROFILE_CPU=1 node tools/perf/responsiveness.mjs
# Movement A/B, using a local reference module:
mkdir -p scratchpad/performance
git show cfb1922:packages/render-2.5d/src/movement.ts > scratchpad/performance/movement-before.ts
node_modules/.bin/vite-node tools/perf/movement-replay.ts scratchpad/performance/movement-before.ts
```

Still rendered only its initial frame in the browser measurement. No long tasks were reported in these scenarios, but headless frame intervals still included 33 ms frames: lower drawing cost is not a locked-60-FPS guarantee. Transport ordering and existing input-before-render scheduling remain unchanged. Network RTT, authenticated play and physical controllers/devices were not measured; no deployment or engine changes were made.

Validation: `npm run test:changed` passed 531 cases in 20 files. Final `npm run verify` passed incremental TypeScript and 2,496 unit cases in 138 files, with two optional-engine cases skipped. `npm run verify:render` passed all 32 browser tests, including the full 4,674-case dungeon raster matrix, retained scenery/fog/spell checks, native reduced motion, Still, and the new immediate-input regression. Browser retries remain zero. No production/build configuration changed, so production/release and separately provisioned engine gates were not run.
