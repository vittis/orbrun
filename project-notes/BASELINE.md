# Phase 0 baseline

Verified 2026-11-11 (America/Sao_Paulo project date). Upstream application/tests/lockfile were left unchanged. Raw logs' host clock is not the project date authority.

## Repository identity

- Workspace: `/Users/vittis/dev/dcss-client`, initially empty and not a Git repository.
- Upstream: `https://github.com/Caeous/orbrun.git`, revision **b65fc15ca1b58969cb061a7749db8cbdb92b8f4d**.
- Hosted fork: [vittis/orbrun](https://github.com/vittis/orbrun), created with `gh repo fork Caeous/orbrun --clone=false --remote=false`; verified `isFork=true`, parent `Caeous/orbrun` via GitHub CLI.
- `origin`: `https://github.com/vittis/orbrun.git`; `upstream`: original URL above. Both fetched, full history preserved.
- Working branch: `chore/phase-0-foundation`. Initialization documentation commit is separate from the upstream baseline; obtain its current SHA with `git rev-parse HEAD` / `git log -1`.
- No application/renderer rewrite. LICENSE, ATTRIBUTION, upstream docs, source and package-lock preserved.

## Environment and acquisition

macOS Darwin arm64; Git 2.50.1 (Apple Git-155); GitHub CLI 2.85.0; Node **24.11.1**, npm **11.6.2**. Locked tools: TypeScript 5.9.3, Vite 7.3.6, Vitest 3.2.7, Three 0.185.1, happy-dom 20.14.0, Wrangler 4.129.0. Ordinary Vite/Wrangler Node constraints satisfied. No root Node pin; track P1-002.

Initial sandbox `git clone` failed DNS resolution; approved network retry succeeded. Downloaded to `/private/tmp/dcss-orbrun-phase0`, then copied into empty workspace alongside the preinitialized notes. Git metadata writes required approved execution. Initial sandbox `gh auth status` reported invalid token; approved retry accessed keyring successfully. No reauthentication was needed. Existing `vittis/orbrun` lookup found none; fork then created and origin configured. These are resolved sandbox limitations, not active blockers.

## Command results on unmodified source

| Command | Exit / status | Evidence and scope |
|---|---|---|
| `npm ci --cache /private/tmp/dcss-npm-cache` | 0 / PASS | 116 packages added, 127 audited; lockfile unchanged |
| `npm test` | 1 / FAIL | 130 files passed, 1 file failed; **1,836 tests passed**. Offline engine file registers no suite without artifacts |
| `npm run typecheck` | 0 / PASS | `tsc -b`; source/project checks, not exhaustive test-file checking |
| `npm run build` | 0 / PASS | Vite output under apps/orbrun/dist; 521.76 kB and 577.13 kB chunks trigger >500 kB warning |
| `npm run e2e` | 1 / FAIL | 2 files failed/10 skipped; **6 tests failed/38 skipped**. Missing stable engine.json |
| `npm audit --json --cache /private/tmp/dcss-npm-cache` | 1 / FINDINGS | 10 vulnerable package nodes: 1 moderate, 7 high, 2 critical. See security triage; no exploitability claim from counts |
| `npm run dev -w apps/orbrun -- --host 127.0.0.1` | running / PASS startup | Vite ready on 127.0.0.1:5173; first sandbox attempt EPERM, approved retry worked |
| `npx --no-install vitest run --exclude packages/offline/test/engine.test.ts` | 0 / PASS partial suite | **130 files, 1,836 tests passed**, 8.28 s. Explicit workaround; does not repair default command |
| Focused controls command in RUNBOOK | 0 / PASS | Independent controls agent: 11 files, 388 tests; synthetic/mock coverage |
| `node project-notes/evidence/security-probes.mjs` | 0 / reproduced risks | Global execution 9 times; private destinations accepted by mock proxy; null message throws. No public attack |
| `git diff --exit-code` before docs commit | 0 / PASS | Tracked upstream source unmodified; only new project-notes files |

Independent build agent reproduced both failures with focused commands. Default failure: `packages/offline/test/engine.test.ts` uses `describe.skipIf(!built.length).each(built)` with `built=[]`, yielding “No test suite found”. E2E failures: five tests in `spell-bar.test.ts`, one in `zz-helpdump.test.ts`; unguarded `startLive()` defaults to stable and reads absent `engine/dist/stable/engine.json`. `probe.test.ts` is skipped unless enabled, not a failing case. This corrects an early mistaken probe/trunk attribution.

## Browser/runtime observations

Browser: Codex in-app browser selected by browser skill; viewport screenshot 1280×720. Exact underlying browser/OS GPU version not captured, so this is not a cross-browser or hardware-performance certification.

| Workflow | Result | Observed evidence / limit |
|---|---|---|
| App shell | PASS | Home page/title, settings/accounts visible; Offline Player has “No games offered” without artifacts |
| Server picker | PASS | Bundled server rows and latency labels; CDI login form displayed; no credentials entered |
| Keyboard UI | PASS limited | Escape returned login → server picker; Escape opened spectator menu |
| Public CDI lobby | PASS | `/watch/cdi` connected and displayed 23-player roster during observation |
| Anonymous public spectating | PASS limited | Selected live DCSS 0.34 player; HUD stats/messages/level updates and actual dungeon visible, no login |
| Remote tile/gamedata loading | PASS for that observed session | Textured dungeon, sprites, portrait and minimap visible; no warning/error entries in queried console logs. No full network waterfall export |
| Live 3D rendering | PASS smoke | Actual textured scene + sprites and HUD; [capture](evidence/live-spectating-3d.png) |
| Canvas | PASS smoke only | Live tiled minimap and room testbed top-down canvas rendered. Main 2D gameplay NOT TESTED: upstream forces 3D |
| Local room renderer UI | PASS | `/testbed/room.html` Canvas/Three render; Face south changes yaw 0°→180° and scene; [capture](evidence/room-renderers.png) |
| Spectator menus/prompts | PASS limited | Orbrun menu, Gamepad controls help, live `--more--` prompt observed. No player interaction claim |
| Physical controller | BLOCKED | No physical hardware supplied/operated; no physical detection/navigation evidence |
| Browser controller emulation | NOT TESTED | Selected browser API exposes no gamepad injection facility; synthetic unit tests are separate |
| Authenticated login/gameplay/rc/save/stat continuity | BLOCKED | No authorized test credentials; trust-boundary fixes required before account-bearing integration |
| Real network reconnect/error injection | NOT TESTED | No controlled browser drop/reopen performed; existing automated tests narrower |
| Other servers/stable-trunk/cross-browser matrix | NOT TESTED | Picker latency labels are not complete protocol/asset compatibility tests |
| Offline gameplay/real-engine E2E | BLOCKED | Missing artifacts + prerequisites below |
| Production preview/deployment | NOT TESTED | Production build passed; no deploy performed |

Anonymous live spectating executes known public server gamedata and is not isolated fixture work. No credentials were entered or read. No public chat/game input was sent. The room testbed uses bundled assets. No new website was built; browser skill was used to validate existing app behavior.

## Offline engine exception

`engine/dist` absent; `em++` not installed/on PATH; PyYAML import fails; current Node24 reports `WebAssembly.Suspending` undefined. Engine docs specify emsdk 6.0.10 and Node25+/JSPI plus native build requirements. A web install/build does not provision these. No expensive engine toolchain installation/build was attempted; this optional path is explicitly deferred. Fix test gating separately (P1-001), then provision dedicated pinned engine CI (P1-002) when needed.

## Evidence durability

Small screenshots, the mock probe and four independent reports are retained in project-notes. Temporary logs `/private/tmp/dcss-{npm-ci,test,typecheck,build,e2e,dev,engine-free-test}.log`, audit JSON and reviewer logs are optional session artifacts. Counts/causes/commands above and RUNBOOK are sufficient to reproduce without them. No secrets or large raw recordings added.
