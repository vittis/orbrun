# Current validation baseline

## Starting point

Stabilization started at `88166befdfa7a4bfa37027751df2de56f039bcdb`, with fetched origin/main `a37449b0749bbbf3c241a55e099947f646c4a860` already an ancestor. Node 24.11.1/npm 11.6.2. Initial forced TypeScript passed; unit suite: **2,236 passed, two optional-engine skips**, 132 files passed/one skipped, 12.04s. Historical simplification results and deployment: [0.3.67](releases/0.3.67.md).

## Stabilized web baseline

`npm run verify` passed locally:

- Forced application and browser-test TypeScript checks: passed.
- Unit suite: **2,292 passed, two optional-engine skips**, 134 files passed/one skipped, 12.56s. The net increase of 56 covers settings normalization, offered-value round trips, lifecycle changes and responsive layout. Final affected HUD/layout/control tests also passed (106 cases).
- Production build: passed. Renderer packages and authored artwork are unchanged. Existing large-main-chunk and mixed JSON-import-attribute warnings remain; these are not test failures.
- Chromium: **14/14 passed**, no skips/retries/flaky results, 59.8s. Includes all nine full raster lanes (**4,072/4,072**), Dungeon/flat atmosphere (**12/12**), actual GameScreen native reduced-motion transitions, mouse/touch-emulated map/overview/settings/resize/targeting, text overflow and online-only production preview. [Browser report](releases/0.3.68/browser.json).
- Engine E2E: **44 cases skipped in 12 files** because optional artifacts are absent. This is not offline-engine acceptance.
- Independent settings, renderer-fixture, map/layout, verification and documentation reviews completed; actionable findings resolved. `git diff --check` passed.

The raster total increased from 4,070 to 4,072 through one mutation-sensitivity assertion per DPR. The obsolete beam-thinning threshold is replaced by an independent native-Canvas reference for exact authored geometry/coverage, including width, thickness and gaps. It does not claim exact RGBA equivalence. No renderer behavior was changed to satisfy the test. Full parameter matrices and deterministic timestamps remain intact.

The narrow fine-pointer HUD now has readable, bounded scroll panes and a separate clear map/prompt region. Chat space remains reachable. Wide desktop and existing phone geometry have regression coverage. Short windows necessarily have a small clear/map area. [Narrow Dungeon](releases/0.3.68/narrow-mouse.png), [map](releases/0.3.68/narrow-map.png).

## Coverage boundaries

Automated Chromium tests use local server-message fixtures and production preview. They do not establish physical-controller, physical-phone, authenticated-login/save continuity, optional engine execution, or every public-server/browser combination. Anonymous production spectating and deployment checks are recorded separately in [the release record](releases/0.3.68.md).

`npm run verify` is the reproducible web gate. Full assertion counts are pinned; the smoke profile is not full acceptance. No player credentials or private recordings are kept in evidence.
