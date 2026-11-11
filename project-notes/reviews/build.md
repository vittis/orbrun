# Agent C — Build, testing and runtime validation

Date: 2026-11-11 (project date). Source: `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d`.

Read-only investigation plus focused test executions. No application, lockfile, dependency, server, or browser changes. Root's development server was left running on loopback port 5173. Browser results belong to the orchestrator and are not independent browser validation by this agent.

## Findings and verified environment

- Node v24.11.1, npm 11.6.2, macOS arm64. Locked tools: Vite 7.3.6, Vitest 3.2.7, TypeScript 5.9.3, three 0.185.1, happy-dom 20.14.0, Wrangler 4.129.0.
- Installed Vite requires Node `^20.19.0 || >=22.12.0`; Wrangler requires `>=22.0.0`; Node 24.11.1 satisfies the ordinary web toolchain. No root Node pin or root `engines` contract found. Recommend pinning the verified web toolchain, separately from the engine toolchain.
- Offline engine prerequisites are **not** satisfied: `engine/dist` absent; `command -v em++` found nothing; `python3 -c 'import yaml'` failed with `ModuleNotFoundError`; `typeof WebAssembly.Suspending` is `undefined` on current Node. Python 3.14.2, GNU Make 3.81 and `/usr/bin/clang++` are present, but a complete native dependency audit/build was not attempted.
- `engine/DEPLOYMENT.md` requires active emsdk, Node 25+ with JSPI, PyYAML, and native WebTiles build dependencies. Engine pins are `engine/.node-version` = 25 and `engine/emsdk-version` = 6.0.10. `engine/build.sh` resolves stable/trunk upstream dynamically; record the resulting `engine.json` commit and recipe for reproducibility. A web build does not build or download the engine.
- `apps/orbrun/engine-files.ts` serves local `engine/dist` for dev/preview and deliberately returns 404 for absent files. A fresh clone can show no offline games even when its shell loads correctly. This is a dependency limitation, not evidence of broken online gameplay.

## Baseline results inspected from root logs

| Command | Observed result | Scope |
| --- | --- | --- |
| `npm ci --cache /private/tmp/dcss-npm-cache` | Exit 0; 116 installed, 127 audited | Lockfile-based install; audit has 10 vulnerable package nodes, security report owns triage. |
| `npm test` | Exit 1; 130 files passed, 1 file failed; 1,836 tests passed | Entire default test selection; empty offline suite fails registration. |
| `npm run typecheck` | Exit 0 | `tsc -b` production/project references; test files are generally outside include lists. |
| `npm run build` | Exit 0 | Vite app bundle; >500 kB chunk warnings; not an engine or browser gameplay test. |
| `npm run e2e` | Exit 1; 2 files failed, 10 skipped; 6 failed, 38 skipped | Missing stable engine artifacts; see exact causes below. |
| `npm run dev -w apps/orbrun -- --host 127.0.0.1` | Root log reports Vite ready at 5173 | Root independently performed browser validation. |

The earlier root draft incorrectly named probe/trunk as the e2e failure. Correct evidence is **spell-bar and zz-helpdump, stable**. This correction was sent to the orchestrator before report completion.

## Independent reproductions

Executed against unmodified source and installed lockfile:

```sh
npx --no-install vitest run packages/offline/test/engine.test.ts
```

Exit **1**. One failed file, no tests registered, duration 219 ms. Exact error: `No test suite found in file .../packages/offline/test/engine.test.ts`. Source cause: `built` filters for stable/trunk `engine.json` at lines 18–19, then `describe.skipIf(!built.length).each(built)` at line 61 receives `[]`; there is no test/suite for Vitest to mark skipped. **Confirmed bug in no-engine test setup, medium severity, high confidence.** Missing optional artifacts are expected on a fresh clone; failing suite registration is an upstream harness defect.

```sh
npx --no-install vitest run -c vitest.e2e.config.ts apps/orbrun/test/e2e/spell-bar.test.ts apps/orbrun/test/e2e/zz-helpdump.test.ts
```

Exit **1**. Two files / six tests fail, duration 429 ms. Five spell-bar tests and `dump help` fail reading `engine/dist/stable/engine.json`. `startLive` (`apps/orbrun/test/e2e/client.ts:378-379`) defaults to stable; `channel` (`engine.ts:29-30`) reads directly. These two files do not guard engine availability. `probe.test.ts` is skipped unless `E2E_PROBE` is set; it did **not** fail in this run. **Confirmed no-engine harness defect, medium severity, high confidence.** `vitest.e2e.config.ts:3` incorrectly claims every file skips without an engine.

Temporary raw logs: `/private/tmp/dcss-build-review-offline.log`, `/private/tmp/dcss-build-review-e2e.log`. Contents summarized above so future work does not require those temporary files.

## Coverage and its limits

- Default config includes package/app `test/**/*.test.ts`, excluding app e2e (`vitest.config.ts:4-6`). Existing recorded evidence includes `packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson`, autopickup, game-link fixtures, scene cell data, pinned gamedata modules, and app menu/CRT/describe fixtures. Tests can replay messages without any public server or user login.
- Existing Canvas tests stub the drawing context (`packages/render-2d/test/render.test.ts:42`); Three tests include fake canvas contexts (`packages/render-3d/test/bed.ts:104`). Geometry/layout/call assertions are useful but cannot prove real GPU output or visual parity.
- E2e harness uses happy-dom plus a real local WebAssembly engine, and loads gamedata without atlas pixels (`apps/orbrun/test/e2e/client.ts:31`). Even a green e2e run would not be a real-browser rendering or physical-controller test.
- Testbeds: `apps/orbrun/testbed/room.html` renders the authored room with both 3D view and 2D map; `compare.html` exposes fixed 3D poses, captures, timing and work counters; grid, walls and menus beds isolate UI/geometry. Useful for baseline observations, not a proof of all live-game modes.
- `tools/build/render-compare.mjs` is an existing headless Chrome/CDP capture/diff harness using temporary profiles and SwiftShader by default. `GPU=1` uses hardware; the two render paths should not be treated as identical performance baselines. It is not run by `npm test`, and no committed render baseline was supplied (`tools/build/render-baseline` ignored). Did not execute this tool because the orchestrator is using the required browser surface and running the app; no independent browser claims.
- `tsc -b` includes app src/testbeds/Vite/proxy/Worker and package source. It does not type-check the entire test corpus, and `skipLibCheck` is enabled. Do not call it exhaustive input-boundary validation.
- Remote asset proxy is required because servers generally do not expose gamedata CORS; WebSockets connect directly. Server-specific `no-compression` support and versioned data remain integration contracts requiring a server matrix.
- Cross-browser/WebGL/physical-gamepad compatibility was not measured. Offline mode uses feature detection (`servers.ts:48-49`); do not promote source comments naming browser versions into a verified compatibility matrix.

## Runbook proposal

For ordinary online-client work from repo root:

```sh
node --version
npm --version
npm ci --include=dev
npm test
npm run typecheck
npm run build
npm run dev -w apps/orbrun -- --host 127.0.0.1
```

`npm ci --include=dev` makes dev-dependency intent explicit even with production environment settings. Root `.npmrc` includes dev, but environment variables can override it; `tools/build/ensure-dev-deps.mjs` can reinstall if Vite is absent. Baseline failing default suite must remain documented until a narrowly scoped no-engine fix lands. Do not present an excluded-suite invocation as a full green baseline.

Reproduce missing-engine e2e failures with the focused command above. After provisioning the engine prerequisites separately, use:

```sh
engine/build.sh stable
node engine/smoke.mjs
npm run e2e
```

These engine commands were **not executed** here. `engine/build.sh` manages its own worktrees and force-cleans them; never point `ENGINE_WORK` at a checkout containing user work. For a reproducible engine run, record resolved upstream commit and recipe from `engine/dist/stable/engine.json`; use a pinned ref for future CI artifacts and document how it maps to the channel expected by tests.

For credential-free validation use the local `/watch/cdi` route and a currently listed public game. A successful lobby alone does not prove gamedata/renderer behavior; check loaded scene, HUD, console and assets. Authenticated play needs explicitly available test credentials; use `.env` only as documented and never log tokens/passwords.

## Recommendations and unresolved work

1. Fix no-engine registration and guard all optional engine suites; add a required-engine CI mode that fails clearly when artifacts are expected. Do not silently turn an expected engine CI job green by skipping everything.
2. Add web toolchain pin and document separate optional engine requirements. Build CI should run npm ci, default tests, typecheck, build; engine CI should separately run smoke and e2e against pinned artifacts.
3. Expand source-recorded regressions before renderer/input changes; verify eight-direction command semantics independently of render mode. Keep visual checks/browser assertions separate from happy-dom suites.
4. Make public-server stable/trunk spectating a bounded optional integration check; do not make ordinary tests depend on live player availability.
5. Keep offline engine distribution optional for this online-first project. Missing engine does not justify a major build/toolchain expansion during Phase 0, but its test exclusion defects must be tracked.

Completed: independent source/toolchain inspection, root log review, exact no-engine failure reproduction and correction. Unresolved: offline engine execution (prerequisites absent), authenticated gameplay, controller hardware, cross-browser visual/runtime validation, exhaustive server support, and production deployment. No application changes were required for this investigation.
