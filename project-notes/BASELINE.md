# Baseline and validation evidence

## Starting point — 2026-11-12

- Clean checkout on `main`; HEAD and fetched `origin/main`: `91bf21a182e75e5ac46a4b0f656ef03296f381b7`.
- Manifest version: 0.3.66. Existing source tag: `cloudflare-online-v1.63`.
- Origin: `https://github.com/vittis/orbrun.git`; upstream: `https://github.com/Caeous/orbrun.git`.
- `npx tsc -b --force`: passed.
- `npm test`: 166 files passed, one file skipped; 2,668 tests passed, two skipped; 13.14 seconds. Optional engine artifacts account for the skips.

These counts describe the baseline only. Removing first-person implementations and their exclusive tests will reduce the suite. Shared controls, scene composition, effects and map behavior must retain meaningful coverage.

## Refactor verification

- Locked clean install: `npm ci --include=dev --prefer-offline --no-audit --no-fund`, 109 packages installed. `npm ls three @types/three --all` is empty.
- Forced TypeScript rebuild: passed. Production build: passed (existing large-entry-chunk warning remains).
- Full unit suite: **2,236 passed, two optional-engine skips**, 132 files passed and one skipped; 13.30s.
- Baseline collected 2,670; current 2,238, net reduction 432. Removed exclusive render-3d geometry/hands/peeling/lens/movement tests, camera/parking/prediction/turning/pips tests and obsolete scene metadata cases. Mixed protocol, scene incremental equivalence, map/pointer, combat/accessibility and settings tests were preserved/adapted; compass, migration and menu lifecycle regressions added. Right-stick pan tests replace the former look-event tests.
- Engine E2E: 12 files /44 cases skipped because optional engine artifacts are absent. This does not prove offline engine gameplay.
- Independent runtime review: 555 tests/31 files, then 136 tests/eight files after final input fixes; no unresolved runtime finding. Independent docs/tooling findings resolved.
- Browser: 2.5D scenery and retained settings inspected; anonymous production-preview CBRG spectating connected. Real GameScreen fixture verifies map/overview/return, settings while map open, repeated replacement cleanup, target cursor and compass command at 390px. The fixture injects its renderer factory; live production preview separately verifies default Dungeon rendering.
- Retained atmosphere raster checks: 12/12 across Dungeon and flat views, desktop/narrow DPR configurations, animation, Still and impact. Tiles 342/342 and markers 216/216 also passed. Surface-light lane passed 25/26; see the baseline mismatch below. Full raster and movement runs exceeded browser responsiveness; remaining raster lanes are unverified, not passes.
- Source/manifests/lockfile/emitted JS+sourcemaps audited: no render-3d, Three runtime, first-person camera, prediction, parking, viewmodel or renderer selector. Legitimate references are migration regression inputs, historical CHANGELOG/attribution/refactor notes and retired analytics column positions.

Release dry-run/publication/hosted identity are recorded in [DEPLOYMENT.md](DEPLOYMENT.md). Screenshots contain public anonymous games or local fixture data. No authenticated-play or physical-controller claim is made.

## Browser limits and pre-existing mismatch

The surface lane reports `thin connected beam segments` at DPR 1: thickness 4, connected span 49 columns, scale 24.9532. Its unchanged assertion permits 3 rows and requires at least 47 columns. Baseline `91bf21a` has the identical assertion, projection, tile compositing and projectile rendering. Earlier `ebdf15b` disabled thinning for traveling sprites but retained the older thin-beam expectation. This refactor preserves those visuals and does not weaken the assertion. The observed failure is retained in [evidence/pixels.json](evidence/pixels.json); replacing the stale requirement with an independent authored-raster oracle is a follow-up.

Browser Still mode stopped the actual GameScreen scheduler. Subsequent live reduced-motion toggle attempts and larger raster runs timed out in the browser connection; no pass is claimed for those attempts. Reduced-motion behavior is covered by the passing Dungeon settings, room lifecycle and combat/accessibility unit tests. Physical controllers, authenticated play and optional engine execution remain unverified.
