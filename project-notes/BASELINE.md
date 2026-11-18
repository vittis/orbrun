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

## Combat popup removal (included in 0.3.69)

Removed the floating-text renderer, CSS, SVG icon factory, Barlow font/license, setting/default, lifecycle/frame hooks, preview overlays, dedicated popup tests, and the two offline-engine damage-number patches. Shared feedback now uses `CombatEvent` without display labels, layout coordinates above actors or popup delay fields. Confirmed melee, hit, spell/healing/status and death effects remain; legacy saved settings are ignored and omitted on the next settings write without touching accounts/saves. Historical release notes remain historical records.

Validation: `npm run verify` passed **2,222 unit cases** (two optional-engine skips), with incremental types; full `verify:render` passed **13 browser cases**, all **4,072 raster assertions** and 12 atmosphere assertions. Production build/preview passed separately. The existing native-motion browser regression now also triggers a local hit through the real GameScreen and checks that a world impact still occurs; its focused run passed. Final healing-strength preservation passed typechecking and 100 affected combat/spell cases. Production output contains no popup renderer/styles or Barlow assets.

`REQUIRE_ENGINE=1 npm run e2e` cannot run without `engine/dist/stable/engine.json`; the removed patches have not been validated in a rebuilt WASM engine. The content-based engine recipe automatically changes when patches are removed, so subsequent engine builds will use the new recipe. These changes are now deployed as **0.3.69**. The integrated release gate and clean-install Linux branch/main CI passed 2,237 tests (2,222 unit and 15 deployment), 14 browser tests, all 4,072 full raster assertions, forced types and production build. [Release evidence](releases/0.3.69.md) records the automatic deployment and hosted acceptance.

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

## LOS shading regression — 2026-11-17

Spatial LOS shading in `2501952` put every nonuniform boundary tile through the fading scratch raster on every redraw, even after visibility settled. Each render also rebuilt the same nine neighbour samples in multiple passes. Exact floating-point fade values selected new 64×64 mask canvases and pixel buffers, so the nominally bounded mask cache still allocated heavily as fades changed. The terrain lighting pass additionally sampled boundary exposure when no light was active.

[Local measurements](los-shading-performance.json), with a visible 1280×720/DPR-2 canvas, a 1,089-cell explored map and a moving circular LOS frontier:

| Median renderer CPU time | Before smoothing | Regressed smoothing | Optimized smoothing |
|---|---:|---:|---:|
| Unchanged LOS, forced redraw | 7.8 ms | 9.3 ms | 8.2 ms |
| Changing LOS | 7.8 ms | 16.8 ms | 9.8 ms |

Over 60 unchanged-LOS frames the regressed renderer performed 6,960 unnecessary scratch composites; the optimized renderer performed none. Over 60 changing-LOS frames, new OffscreenCanvas allocations fell from 9,964 to 2, pixel-buffer allocations from 9,964 to 1, and uploaded mask pixels from 40.8 million to 2.2 million. The remaining smoothing cost is measurable; these local headless CPU timings do not establish physical-device FPS or eliminate browser scheduling/raster variability. A separate alternating idle comparison measured 9.4–9.5 ms before the fix and 8.1–8.2 ms after it.

The fix caches settled terrain rasters, retains settled neighbour fields and samples active fades once per cell/frame. Two small reusable, independently filtered mask buffers handle changing darkness and exposure. Lighting work is skipped when inactive; confirmed visible/fading receivers and remembered boundary exposure retain the existing reachability checks. Deterministic resource-reuse and cache-invalidation regressions protect the allocation behavior without wall-clock assertions.

Reproduce outside the default test suite, with this checkout's strict loopback server running:

```sh
LOS_PERF_FRAMES=60 LOS_PERF_SCENARIOS=map-idle,map-los node tools/perf/los-shading.mjs http://127.0.0.1:5297 96dc64e 2501952
```

The tool extracts historical renderer sources into temporary ignored workspace folders and removes them afterward. Omit the environment overrides to include the authored room and measure 120 frames per case.

## LOS movement GPU regression — 2026-11-17

The earlier allocation fix did not remove repeated canvas write/read dependencies. Each fading boundary tile rewrote a shared terrain scratch canvas after submitting it to the main canvas. Exposure masks also updated individual CPU-backed canvases. Those dependencies remained expensive in hardware Chrome even when renderer CPU submission fit below 8.3 ms. The earlier headless browser used SwiftShader with software Canvas/compositing, so its CPU timings were insufficient evidence for a 120 Hz target.

[Hardware Chrome measurements](los-moving-performance.json) record the backend explicitly. A moving large-map test reproduced median frame intervals of **8.3 ms before smoothing** and **16.7 ms after the first fix**.

The final comparison uses the actual GameScreen scheduler at 1280×720/DPR 2, including HUD, movement, camera following, fog, lighting and confirmed LOS updates every 90 ms:

| Trailing 240-frame window | Previous fix | Batched/pool renderer |
|---|---:|---:|
| Median frame interval | 8.4 ms | 8.3 ms |
| 95th-percentile frame interval | 17.3 ms | 9.3 ms |
| Maximum frame interval | 17.6 ms | 9.4 ms |
| Median game-loop CPU work | 5.4 ms | 4.2 ms |

The previous fix reported 69 dropped frames in its retained window. The final window's maximum interval stayed below the 12.5 ms threshold for a missed 120 Hz frame. A separate comparison with the pre-smoothing renderer also delivered 8.3 ms median intervals. These are local synthetic-fixture results on Apple M3 Pro/Metal, not a guarantee for every gameplay scene or device.

The fix batches changing 9×9 mask fields into one atlas update before drawing. Gutters continue the sampled field so filtering cannot create seams at tile borders. Terrain and lighting use bounded pools instead of rewriting a submitted canvas; identical terrain composites share an immutable raster within a frame. Regression tests protect upload batching, resource reuse, frame-local raster isolation, matching filtered edges, and the retained raster/visibility behavior.

Reproduce with a strict loopback Vite server and normal hardware Chrome:

```sh
LOS_PERF_HEADFUL=1 LOS_PERF_BROWSER=chrome LOS_PERF_SCENARIOS=map-moving,room-moving node tools/perf/los-shading.mjs http://127.0.0.1:5297 96dc64e 5759923
# Actual GameScreen, optionally substituting a local historical renderer snapshot:
LOS_PERF_HEADFUL=1 LOS_PERF_BROWSER=chrome PERF_DPR=2 RESPONSIVENESS_SCENARIOS=moving-los-fog node tools/perf/responsiveness.mjs http://127.0.0.1:5297
```

Moving standalone cases warm their movement/fade paths for 1.5 seconds and measure three seconds with a fixed 90 ms update cadence independent of FPS. The GameScreen tool retains its six-second observation and trailing frame window. Both tools report the GPU backend; keep performance evidence outside the default suite and do not substitute software-headless FPS for hardware acceptance.

## Dungeon effects and replay pacing — 2026-11-18

Compared the working renderer with release 0.3.140 (`4b6808b`) using the bundled **Polar Vortex in Gehenna** recording, its version-pinned art, default settings and the menu playback clock. Both versions ran sequentially in hardware Chrome 157 on an Apple M3 Pro with Metal and accelerated Canvas 2D. The replay occupied a 1280×720 canvas at DPR 1. The benchmark stops after a paint containing the same recorded update in both versions. It includes the first draw and cache warm-up. Render time measures the renderer call on the main thread. Paint-start intervals also include the replay's 30 FPS cap, scheduling and stalls.

| Workload | Metric | Before | After |
| --- | --- | ---: | ---: |
| All 207 updates, 4× CPU throttle | Median render time | 42.9 ms | 14.1 ms |
| | 95th / 99th percentile render time | 88.7 / 116.6 ms | 44.8 / 60.6 ms |
| | Median paint interval | 44.7 ms | 33.4 ms |
| | 95th / 99th percentile paint interval | 91.0 / 119.4 ms | 47.3 / 61.5 ms |
| Opening fight, first 73 updates, native CPU speed | Median / 95th percentile render time | 11.5 / 19.8 ms | 3.9 / 8.8 ms |
| | Median / 95th percentile paint interval | 41.5 / 42.5 ms | 33.3 / 41.6 ms |

The complete throttled run drew 1,283 frames before and 1,581 after. The opening comparison drew 389 and 450. Heavy frames still exceed the 33.3 ms replay budget under throttling. Physical entry-level GPUs, sustained mobile thermals and authenticated online play were outside these local measurements.

The dungeon renderer reuses masked light gradients and applies their pulse and afterglow intensity each frame. Only the soft light field uses half resolution on each axis. Receivers still sample their current visibility and moving silhouettes. In-cell sprites use a tight filtered raster, with full padding retained for overhanging art. Fog reuses distance and blur fields while the sampled exploration silhouette stays the same. Deep inside explored terrain it omits a noise contribution of at most one 8-bit opacity level. The replay carries the 30 FPS paint deadline across fractional display refreshes. The recording clock still delivers each authored update independently.

Three fixed-time draws at 3, 5 and 7 seconds were compared at both 1280×720 and 390×844. Across these six pairs the largest frame-wide mean absolute RGB difference was 0.265 on a 0–255 scale. In every pair, at least 99% of pixels differed by at most four levels in any RGB channel.

Two additional local comparisons exercised different workloads.

- **Ignition in the Slime Pits**, first 42 updates, 1280×720, bundled headless Chromium 158 using software Canvas and SwiftShader. Median / 95th percentile render time fell from 6.2 / 26.5 ms to 5.0 / 8.5 ms. Median / 95th percentile paint interval fell from 49.3 / 51.0 ms to 33.3 / 36.6 ms.
- **GameScreen movement with changing LOS and fog**, 1280×720 at DPR 2, hardware Chrome with six seconds of movement after warm-up. The trailing 240 frames held a median 8.3 ms interval on both versions. The 95th percentile interval measured 9.7 ms before and 8.6 ms after. Median / 95th percentile gameplay render time went from 3.5 / 3.9 ms to 3.2 / 3.5 ms.

To repeat against this checkout or another local Vite origin, run the benchmark with other workloads idle.

```sh
npm run dev -w apps/orbrun -- --host 127.0.0.1 --port 5396 --strictPort
# In a second terminal
REPLAY_CPU=4 REPLAY_MS=55000 node tools/perf/replay-effects.mjs http://127.0.0.1:5396
node tools/perf/replay-effects.mjs http://127.0.0.1:5396
# Fixed-time screenshots at 3, 5 and 7 seconds. Set REPLAY_NARROW=1 for 390×844.
REPLAY_CAPTURE=/tmp/orbrun-gehenna node tools/perf/replay-effects.mjs
REPLAY_HEADLESS=1 REPLAY_SCENE='Ignition in the Slime Pits' node tools/perf/replay-effects.mjs
LOS_PERF_HEADFUL=1 LOS_PERF_BROWSER=chrome PERF_DPR=2 RESPONSIVENESS_SCENARIOS=moving-los-fog node tools/perf/responsiveness.mjs http://127.0.0.1:5396
```

Verification on the final code passed TypeScript, all 516 cases selected by `npm run test:changed`, and 22 Playwright cases including the full 5,160-assertion dungeon raster matrix. The default browser port was occupied, so the checks used an isolated strict loopback port, 5398. A pre-existing Snake Pit timing test referenced a five-cell shot from a retired clip. Its replacement checks the current recording's six confirmed cells and their exact inter-frame delays. A fake 120 Hz display also exercises the menu paint cadence and recovery from a stall.
