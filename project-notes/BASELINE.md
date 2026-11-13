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
